import type { Editor, TLShapeId } from 'tldraw'
import { createShapeId, toRichText } from 'tldraw'
import type { Bridge, InterviewTree, PastQuestion, QNode } from './types'

/**
 * The canvas layer. Owns the mapping between LOGICAL node ids (stable strings
 * from trees.ts) and live tldraw shape ids, seeds the question trees onto the
 * board, and renders engine state as tldraw shapes — never CSS, so everything
 * stays a real editable board.
 *
 * Visual language:
 *   - node outline color   = which tree it belongs to
 *   - filled node          = question was asked (covered)
 *   - solid blue ring       = active (being discussed right now)
 *   - dashed blue ring      = suggested next question
 *   - dashed orange ring    = gap (skipped, should have been asked)
 *   - violet dashed arrow   = bridge between two trees
 *   - dotted grey node      = past-interview suggestion that fits here
 */

export const NODE_W = 230
export const NODE_H = 92

type RingKind = 'active' | 'suggested' | 'gap'

const RING_STYLE: Record<RingKind, { color: string; dash: string; size: string }> = {
  active: { color: 'blue', dash: 'solid', size: 'l' },
  suggested: { color: 'light-blue', dash: 'dashed', size: 'm' },
  gap: { color: 'orange', dash: 'dashed', size: 'm' },
}

export class Canvas {
  editor: Editor
  /** logical node id -> tldraw shape id */
  private idOf = new Map<string, TLShapeId>()
  /** tldraw shape id -> logical node id */
  private logicalOf = new Map<TLShapeId, string>()
  private nodeById = new Map<string, QNode>()
  private ghostShown = new Set<string>()
  private bridgeShown = new Set<string>()

  constructor(editor: Editor) {
    this.editor = editor
  }

  logicalToShape(id: string): TLShapeId | undefined {
    return this.idOf.get(id)
  }
  shapeToLogical(id: TLShapeId): string | undefined {
    return this.logicalOf.get(id)
  }

  /** Seed all trees (nodes + branch arrows) onto an empty board. */
  seed(trees: InterviewTree[]) {
    for (const tree of trees) for (const n of tree.nodes) this.nodeById.set(n.id, n)

    // Already seeded (e.g. React StrictMode remount, or HMR): rebuild the
    // logical<->shape id maps from existing meta rather than duplicating shapes.
    const existing = this.editor.getCurrentPageShapes()
    if (existing.some((s) => (s.meta as { imNode?: string }).imNode)) {
      for (const s of existing) {
        const logical = (s.meta as { imNode?: string }).imNode
        if (logical) {
          this.idOf.set(logical, s.id)
          this.logicalOf.set(s.id, logical)
        }
      }
      return
    }

    // 1) nodes
    for (const tree of trees) {
      for (const node of tree.nodes) {
        this.nodeById.set(node.id, node)
        const shapeId = createShapeId()
        this.idOf.set(node.id, shapeId)
        this.logicalOf.set(shapeId, node.id)
        this.editor.createShape({
          id: shapeId,
          type: 'geo',
          x: node.x,
          y: node.y,
          props: {
            geo: 'rectangle',
            w: NODE_W,
            h: NODE_H,
            richText: toRichText(node.question),
            color: tree.color,
            fill: 'none',
            dash: 'solid',
            align: 'middle',
            verticalAlign: 'middle',
            size: 's',
          },
          meta: { imNode: node.id, tree: tree.id },
        } as never)
      }
    }

    // 2) branch arrows (parent bottom-center -> child top-center)
    for (const tree of trees) {
      for (const node of tree.nodes) {
        for (const childId of node.children) {
          const child = this.nodeById.get(childId)
          if (!child) continue
          // Branch arrows are structure — keep them light grey so they recede
          // behind the journey trail and state rings.
          this.drawArrow(node, child, 'grey', 'dashed', `arrow-${node.id}-${childId}`)
        }
      }
    }

    this.editor.selectNone()
    // Defer the fit: at onMount the tldraw container can still be 0-sized, so
    // an immediate zoomToFit computes against an empty viewport (5% zoom).
    requestAnimationFrame(() => this.editor.zoomToFit({ animation: { duration: 0 } }))
  }

  /** Draw a static arrow between two nodes, bottom-center -> top-center. */
  private drawArrow(from: QNode, to: QNode, color: string, dash: string, key: string) {
    const start = { x: from.x + NODE_W / 2, y: from.y + NODE_H }
    const end = { x: to.x + NODE_W / 2, y: to.y }
    const id = createShapeId(key)
    if (this.editor.getShape(id)) return
    this.editor.createShape({
      id,
      type: 'arrow',
      x: start.x,
      y: start.y,
      props: {
        start: { x: 0, y: 0 },
        end: { x: end.x - start.x, y: end.y - start.y },
        color,
        dash,
        size: 's',
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
      },
      meta: { imArrow: key },
    } as never)
  }

  /** Mark a node asked (filled) or reset to pending (hollow). */
  setAsked(logicalId: string, asked: boolean) {
    const id = this.idOf.get(logicalId)
    if (!id) return
    this.editor.updateShape({
      id,
      type: 'geo',
      props: { fill: asked ? 'solid' : 'none' },
    } as never)
  }

  /** Pan a node into view, keeping zoom. */
  centerOn(logicalId: string) {
    const id = this.idOf.get(logicalId)
    if (!id) return
    const b = this.editor.getShapePageBounds(id)
    if (b) this.editor.centerOnPoint(b.center, { animation: { duration: 350 } })
  }

  // ---- rings: cleared and redrawn from state on every transition ----

  clearRings() {
    const ids = this.editor
      .getCurrentPageShapes()
      .filter((s) => (s.meta as { imRing?: unknown }).imRing)
      .map((s) => s.id)
    if (ids.length) this.editor.deleteShapes(ids)
  }

  drawRing(logicalId: string, kind: RingKind) {
    const nodeId = this.idOf.get(logicalId)
    if (!nodeId) return
    const b = this.editor.getShapePageBounds(nodeId)
    if (!b) return
    const pad = kind === 'active' ? 12 : 8
    const style = RING_STYLE[kind]
    const id = createShapeId()
    this.editor.createShape({
      id,
      type: 'geo',
      x: b.x - pad,
      y: b.y - pad,
      props: {
        geo: 'rectangle',
        w: b.w + pad * 2,
        h: b.h + pad * 2,
        color: style.color,
        fill: 'none',
        dash: style.dash,
        size: style.size,
      },
      meta: { imRing: kind, ringFor: logicalId },
    } as never)
    this.editor.sendToBack([id])
  }

  // ---- journey trail: the ordered path of asked questions ----

  clearJourney() {
    const ids = this.editor
      .getCurrentPageShapes()
      .filter((s) => {
        const m = s.meta as { imJourney?: unknown; imBadge?: unknown }
        return m.imJourney || m.imBadge
      })
      .map((s) => s.id)
    if (ids.length) this.editor.deleteShapes(ids)
  }

  /**
   * Draw the history: a numbered badge on each asked node (ask order) and a bold
   * translucent trail connecting them in sequence — the actual route taken
   * through the trees, topic jumps included.
   */
  drawJourney(orderedIds: string[]) {
    this.clearJourney()
    const centers = new Map<string, { x: number; y: number }>()
    for (const id of orderedIds) {
      const shapeId = this.idOf.get(id)
      if (!shapeId) continue
      const b = this.editor.getShapePageBounds(shapeId)
      if (b) centers.set(id, b.center)
    }

    // trail segments
    for (let i = 0; i < orderedIds.length - 1; i++) {
      const from = centers.get(orderedIds[i])
      const to = centers.get(orderedIds[i + 1])
      if (!from || !to) continue
      const arrowId = createShapeId()
      this.editor.createShape({
        id: arrowId,
        type: 'arrow',
        x: from.x,
        y: from.y,
        opacity: 0.55,
        props: {
          start: { x: 0, y: 0 },
          end: { x: to.x - from.x, y: to.y - from.y },
          color: 'black',
          dash: 'solid',
          size: 'm',
          arrowheadStart: 'none',
          arrowheadEnd: 'arrow',
        },
        meta: { imJourney: true },
      } as never)
    }

    // order badges (drawn last so they sit on top of the trail)
    orderedIds.forEach((id, i) => {
      const shapeId = this.idOf.get(id)
      if (!shapeId) return
      const b = this.editor.getShapePageBounds(shapeId)
      if (!b) return
      const badgeId = createShapeId()
      this.editor.createShape({
        id: badgeId,
        type: 'geo',
        x: b.x - 14,
        y: b.y - 14,
        props: {
          geo: 'ellipse',
          w: 30,
          h: 30,
          richText: toRichText(String(i + 1)),
          color: 'black',
          fill: 'none',
          align: 'middle',
          verticalAlign: 'middle',
          size: 's',
        },
        meta: { imBadge: true },
      } as never)
      this.editor.bringToFront([badgeId])
    })
  }

  // ---- anticipation: signalled next steps, not yet asked ----

  clearAnticipation() {
    const ids = this.editor
      .getCurrentPageShapes()
      .filter((s) => (s.meta as { imAnticipate?: unknown }).imAnticipate)
      .map((s) => s.id)
    if (ids.length) this.editor.deleteShapes(ids)
  }

  /**
   * A yellow dotted halo on each signalled next node, and — for a forming
   * bridge — a faint dotted arrow from its source so it reads as "a bridge is
   * forming here" before it actually fires.
   */
  drawAnticipation(
    items: { kind: 'branch' | 'bridge'; nodeId: string; fromNodeId?: string }[],
  ) {
    this.clearAnticipation()
    for (const it of items) {
      const nodeId = this.idOf.get(it.nodeId)
      if (!nodeId) continue
      const b = this.editor.getShapePageBounds(nodeId)
      if (!b) continue

      const pad = 18
      const ring = createShapeId()
      this.editor.createShape({
        id: ring,
        type: 'geo',
        x: b.x - pad,
        y: b.y - pad,
        props: {
          geo: 'rectangle',
          w: b.w + pad * 2,
          h: b.h + pad * 2,
          color: 'yellow',
          fill: 'none',
          dash: 'dotted',
          size: 'l',
        },
        meta: { imAnticipate: true },
      } as never)
      this.editor.sendToBack([ring])

      if (it.kind === 'bridge' && it.fromNodeId) {
        const fromId = this.idOf.get(it.fromNodeId)
        const fb = fromId ? this.editor.getShapePageBounds(fromId) : undefined
        if (fb) {
          const a = fb.center
          const c = b.center
          const arrowId = createShapeId()
          this.editor.createShape({
            id: arrowId,
            type: 'arrow',
            x: a.x,
            y: a.y,
            opacity: 0.35,
            props: {
              start: { x: 0, y: 0 },
              end: { x: c.x - a.x, y: c.y - a.y },
              color: 'violet',
              dash: 'dotted',
              size: 's',
              arrowheadStart: 'none',
              arrowheadEnd: 'arrow',
              bend: 40,
            },
            meta: { imAnticipate: true },
          } as never)
        }
      }
    }
  }

  // ---- bridges ----

  showBridge(bridge: Bridge, nodeById: Map<string, QNode>) {
    if (this.bridgeShown.has(bridge.id)) return
    const from = nodeById.get(bridge.from)
    const to = nodeById.get(bridge.to)
    if (!from || !to) return
    this.bridgeShown.add(bridge.id)

    // Just a violet dashed arrow between the two nodes — the bridge question
    // text lives in the sidebar, so the canvas stays uncluttered. Arrow runs
    // between the nearest horizontal edges of the two nodes.
    const fromRight = from.x + NODE_W < to.x
    const a = { x: fromRight ? from.x + NODE_W : from.x, y: from.y + NODE_H / 2 }
    const b = { x: fromRight ? to.x : to.x + NODE_W, y: to.y + NODE_H / 2 }
    const arrowId = createShapeId(`bridge-arrow-${bridge.id}`)
    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: a.x,
      y: a.y,
      opacity: 0.7,
      props: {
        start: { x: 0, y: 0 },
        end: { x: b.x - a.x, y: b.y - a.y },
        color: 'violet',
        dash: 'dashed',
        size: 's',
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        bend: 40,
      },
      meta: { imBridge: bridge.id },
    } as never)
  }

  // ---- past-interview ghost nodes ----

  showGhost(pq: PastQuestion, nodeById: Map<string, QNode>) {
    if (this.ghostShown.has(pq.id)) return
    const anchor = nodeById.get(pq.fitsNear)
    if (!anchor) return
    this.ghostShown.add(pq.id)

    const x = pq.x
    const y = pq.y
    const id = createShapeId(`ghost-${pq.id}`)
    this.editor.createShape({
      id,
      type: 'geo',
      x,
      y,
      props: {
        geo: 'rectangle',
        w: NODE_W,
        h: NODE_H,
        richText: toRichText(`FROM PAST INTERVIEWS\n${pq.question}\nseen in ${pq.seenIn}`),
        color: 'grey',
        fill: 'none',
        dash: 'dotted',
        align: 'middle',
        verticalAlign: 'middle',
        size: 's',
      },
      meta: { imGhost: pq.id },
    } as never)

    // faint dotted connector, anchor center -> ghost center (association line)
    const a = { x: anchor.x + NODE_W / 2, y: anchor.y + NODE_H / 2 }
    const b = { x: x + NODE_W / 2, y: y + NODE_H / 2 }
    const arrowId = createShapeId(`ghost-arrow-${pq.id}`)
    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: a.x,
      y: a.y,
      opacity: 0.5,
      props: {
        start: { x: 0, y: 0 },
        end: { x: b.x - a.x, y: b.y - a.y },
        color: 'grey',
        dash: 'dotted',
        size: 's',
        arrowheadStart: 'none',
        arrowheadEnd: 'none',
      },
      meta: { imGhost: pq.id },
    } as never)
  }

  /** Full reset back to seeded/pending state (rings, ghosts, bridges gone). */
  reset(nodeIds: string[]) {
    this.clearRings()
    this.clearJourney()
    this.clearAnticipation()
    const extras = this.editor
      .getCurrentPageShapes()
      .filter((s) => {
        const m = s.meta as { imBridge?: unknown; imGhost?: unknown }
        return m.imBridge || m.imGhost
      })
      .map((s) => s.id)
    if (extras.length) this.editor.deleteShapes(extras)
    this.bridgeShown.clear()
    this.ghostShown.clear()
    for (const id of nodeIds) this.setAsked(id, false)
  }
}
