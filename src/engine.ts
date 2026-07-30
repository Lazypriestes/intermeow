import type { Bridge, InterviewTree, LiveLine, PastQuestion, QNode } from './types'
import { scoreKeywords } from './matcher'
import type { Canvas } from './canvas'

const ANTICIPATE_MIN = 2 // a weak hint (one keyword): signal, don't jump yet
const CONFIRM_MIN = 3 // a strong match (phrase or 2+ keywords): mark asked, jump
const BRIDGE_MIN = 4 // stronger overlap needed to fire a cross-tree bridge
const GHOST_MIN = 2 // a past-interview fit surfaces when an ANSWER hits its theme

/** A signalled-but-not-yet-asked next step: a branch continuation or a bridge. */
export interface Anticipation {
  kind: 'branch' | 'bridge'
  /** Node to highlight — the branch child, or the bridge's far node. */
  nodeId: string
  /** For bridges: the node the bridge starts from. */
  fromNodeId?: string
  bridgeId?: string
  label: string
}

export type Speaker = 'interviewer' | 'interviewee'

export interface EngineState {
  running: boolean
  activeId: string | null
  asked: string[] // logical ids, in the order they were asked
  suggested: string[] // unasked children of the active node = next logical steps
  anticipated: Anticipation[] // signalled-but-not-yet-asked next steps
  gaps: string[] // unasked children of asked, non-active nodes = skipped
  bridges: string[] // active bridge ids
  ghosts: string[] // revealed past-question ids
  ghostTriggers: Record<string, string> // ghost id -> the answer that surfaced it
  liveLines: LiveLine[]
  lastHeard: string
  lastSpeaker: Speaker
}

const EMPTY: EngineState = {
  running: false,
  activeId: null,
  asked: [],
  suggested: [],
  anticipated: [],
  gaps: [],
  bridges: [],
  ghosts: [],
  ghostTriggers: {},
  liveLines: [],
  lastHeard: '',
  lastSpeaker: 'interviewer',
}

/**
 * The interview brain. Feeds transcript lines through the keyword matcher onto
 * the question trees, tracks what's been asked, and derives the live guidance:
 * next questions, gaps, bridges, and past-interview suggestions. All canvas
 * changes are delegated to the Canvas layer.
 */
export class Engine {
  private canvas: Canvas
  private bridges: Bridge[]
  private past: PastQuestion[]
  private nodeById = new Map<string, QNode>()
  private treeTitleById = new Map<string, string>()
  private state: EngineState = { ...EMPTY }
  /** While replaying for a scrub, suppress per-line panning. */
  private silent = false
  private listeners = new Set<(s: EngineState) => void>()

  constructor(
    canvas: Canvas,
    trees: InterviewTree[],
    bridges: Bridge[],
    past: PastQuestion[],
  ) {
    this.canvas = canvas
    this.bridges = bridges
    this.past = past
    for (const t of trees) {
      this.treeTitleById.set(t.id, t.title)
      for (const n of t.nodes) this.nodeById.set(n.id, n)
    }
  }

  /** Which tree a node belongs to, and that tree's title. */
  treeIdOf(id: string): string | undefined {
    return this.nodeById.get(id)?.treeId
  }
  treeTitle(treeId: string): string {
    return this.treeTitleById.get(treeId) ?? treeId
  }

  subscribe(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit() {
    const snap = { ...this.state }
    for (const fn of this.listeners) fn(snap)
  }

  labelOf(id: string): string {
    return this.nodeById.get(id)?.question ?? id
  }

  bridgeById(id: string): Bridge | undefined {
    return this.bridges.find((b) => b.id === id)
  }
  pastById(id: string): PastQuestion | undefined {
    return this.past.find((p) => p.id === id)
  }

  private resetForRun() {
    this.canvas.reset([...this.nodeById.keys()])
    this.state = { ...EMPTY, running: true }
  }

  start() {
    if (this.state.running) return
    this.resetForRun()
    this.render()
    this.emit()
  }

  /**
   * Rebuild state at an arbitrary transcript position by replaying lines
   * 0..upto from scratch. Deterministic matching makes this exact, so the
   * timeline can be scrubbed backward as freely as forward.
   */
  replay(lines: { text: string; speaker: Speaker }[], upto: number) {
    this.silent = true
    this.resetForRun()
    const n = Math.max(0, Math.min(upto, lines.length))
    for (let i = 0; i < n; i++) this.ingest(lines[i].text, lines[i].speaker)
    this.silent = false
    this.render()
    if (this.state.activeId) this.canvas.centerOn(this.state.activeId)
    this.emit()
  }

  stop() {
    if (!this.state.running) return
    this.canvas.clearRings()
    this.canvas.clearJourney()
    this.canvas.clearAnticipation()
    this.state = { ...EMPTY }
    this.emit()
  }

  /** Feed one finalized utterance. */
  ingest(text: string, speaker: Speaker = 'interviewer') {
    if (!this.state.running) return
    this.state.lastHeard = text
    this.state.lastSpeaker = speaker

    // 1) best-matching question node
    const best = this.bestNode(text)
    if (best) {
      if (!this.state.asked.includes(best)) {
        this.state.asked = [...this.state.asked, best]
        this.canvas.setAsked(best, true)
      }
      this.state.activeId = best
      this.state.liveLines = [...this.state.liveLines, { text, at: Date.now() }]
    }

    // 2) bridges: from-node asked + this line hits bridge keywords
    for (const br of this.bridges) {
      if (this.state.bridges.includes(br.id)) continue
      const bothAsked =
        this.state.asked.includes(br.from) && this.state.asked.includes(br.to)
      const hot =
        this.state.asked.includes(br.from) && scoreKeywords(text, br.keywords) >= BRIDGE_MIN
      if (bothAsked || hot) {
        this.state.bridges = [...this.state.bridges, br.id]
        this.canvas.showBridge(br, this.nodeById)
      }
    }

    // 3) past-interview fits: surfaced when the interviewee's ANSWER hits the
    // theme of a past question — i.e. contextual to what they just said, not
    // merely to which node we reached.
    if (speaker === 'interviewee') {
      for (const pq of this.past) {
        if (this.state.ghosts.includes(pq.id)) continue
        if (scoreKeywords(text, pq.keywords) >= GHOST_MIN) {
          this.state.ghosts = [...this.state.ghosts, pq.id]
          this.state.ghostTriggers = { ...this.state.ghostTriggers, [pq.id]: text }
          this.canvas.showGhost(pq, this.nodeById)
        }
      }
    }

    this.recomputeFrontier()
    this.recomputeAnticipation(text)
    this.render()
    if (best && !this.silent) this.canvas.centerOn(best)
    this.emit()
  }

  /**
   * Signal (not commit) where the conversation is heading: unasked branch
   * children of the active node, or bridges from asked nodes, that the current
   * line hints at (weak keyword score) without yet confirming a jump. Sticky:
   * a signalled step stays lit until it's asked/fired or no longer reachable.
   */
  private recomputeAnticipation(text: string) {
    const asked = new Set(this.state.asked)
    const fired = new Set(this.state.bridges)
    const active = this.state.activeId
    const activeNode = active ? this.nodeById.get(active) : undefined

    const next: Anticipation[] = []
    const seen = (nodeId: string, kind: string) =>
      next.some((a) => a.nodeId === nodeId && a.kind === kind)

    // keep still-valid signals from last turn (stickiness)
    for (const a of this.state.anticipated) {
      if (a.kind === 'branch') {
        if (!asked.has(a.nodeId) && activeNode?.children.includes(a.nodeId)) next.push(a)
      } else if (a.bridgeId) {
        const br = this.bridges.find((b) => b.id === a.bridgeId)
        if (br && !fired.has(br.id) && asked.has(br.from) && !asked.has(br.to)) next.push(a)
      }
    }

    // new branch hints: children of active with a weak score
    if (activeNode) {
      for (const childId of activeNode.children) {
        if (asked.has(childId) || seen(childId, 'branch')) continue
        const s = scoreKeywords(text, this.nodeById.get(childId)?.keywords ?? [])
        if (s >= ANTICIPATE_MIN && s < CONFIRM_MIN) {
          next.push({ kind: 'branch', nodeId: childId, label: this.labelOf(childId) })
        }
      }
    }

    // new bridge hints: from asked, not yet fired, with a weak score
    for (const br of this.bridges) {
      if (fired.has(br.id) || seen(br.to, 'bridge')) continue
      if (!asked.has(br.from) || asked.has(br.to)) continue
      const s = scoreKeywords(text, br.keywords)
      if (s >= ANTICIPATE_MIN && s < BRIDGE_MIN) {
        next.push({
          kind: 'bridge',
          nodeId: br.to,
          fromNodeId: br.from,
          bridgeId: br.id,
          label: br.question,
        })
      }
    }

    this.state.anticipated = next
  }

  /** Suggested = unasked children of active; gaps = unasked children of other asked nodes. */
  private recomputeFrontier() {
    const asked = new Set(this.state.asked)
    const suggested: string[] = []
    const gaps: string[] = []
    for (const id of this.state.asked) {
      const node = this.nodeById.get(id)
      if (!node) continue
      for (const childId of node.children) {
        if (asked.has(childId)) continue
        if (id === this.state.activeId) suggested.push(childId)
        else if (!gaps.includes(childId)) gaps.push(childId)
      }
    }
    // A child suggested off the active node shouldn't also read as a gap.
    this.state.suggested = suggested
    this.state.gaps = gaps.filter((g) => !suggested.includes(g))
  }

  /** Redraw rings + anticipation + the journey trail from current state. */
  private render() {
    this.canvas.clearRings()
    const anti = new Set(this.state.anticipated.map((a) => a.nodeId))
    for (const id of this.state.gaps) this.canvas.drawRing(id, 'gap')
    // an anticipated child gets the louder anticipation cue instead of a plain
    // "suggested" ring, so it doesn't wear two rings at once.
    for (const id of this.state.suggested) {
      if (!anti.has(id)) this.canvas.drawRing(id, 'suggested')
    }
    if (this.state.activeId) this.canvas.drawRing(this.state.activeId, 'active')
    this.canvas.drawAnticipation(this.state.anticipated)
    this.canvas.drawJourney(this.state.asked)
  }

  /**
   * Pick the best question node for an utterance. Ties break toward an unasked
   * child of the current active node (keeps the interview flowing down the
   * branch it's already on), then toward any unasked node.
   */
  private bestNode(text: string): string | null {
    const active = this.state.activeId
    const activeChildren = new Set(
      active ? (this.nodeById.get(active)?.children ?? []) : [],
    )
    const asked = new Set(this.state.asked)

    let bestId: string | null = null
    let bestScore = 0
    let bestRank = -1
    for (const node of this.nodeById.values()) {
      const score = scoreKeywords(text, node.keywords)
      if (score < CONFIRM_MIN) continue
      // rank: prefer unasked child of active (2) > unasked (1) > asked (0)
      let rank = 0
      if (!asked.has(node.id)) rank = activeChildren.has(node.id) ? 2 : 1
      if (score > bestScore || (score === bestScore && rank > bestRank)) {
        bestScore = score
        bestRank = rank
        bestId = node.id
      }
    }
    return bestId
  }
}
