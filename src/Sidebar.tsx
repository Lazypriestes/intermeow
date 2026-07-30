import { useEffect, useRef, useState } from 'react'
import type { Engine, EngineState } from './engine'
import { SCRIPT } from './trees'
import { createSpeech, isSupported, type SpeechController } from './speech'

const STEP_MS = 2800

/**
 * Non-canvas control + insight panel. Drives the scripted interview, and shows
 * the engine's live guidance: current question, next steps, gaps, bridges, and
 * past-interview suggestions.
 */
export function Sidebar({ engine }: { engine: Engine }) {
  const [state, setState] = useState<EngineState | null>(null)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const [manual, setManual] = useState('')
  const [speech, setSpeech] = useState<SpeechController | null>(null)
  const [mic, setMic] = useState('idle')
  const stepRef = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => engine.subscribe(setState), [engine])
  useEffect(() => () => window.clearInterval(timer.current), [])

  // Optional live mic (Web Speech). Scripted playback is the primary path.
  useEffect(() => {
    if (!isSupported()) return
    const ctrl = createSpeech(
      (t) => engine.ingest(t, 'interviewer'),
      (s) => setMic(s),
    )
    setSpeech(ctrl)
    return () => ctrl?.stop()
  }, [engine])

  if (!state) return null
  const running = state.running

  const stopPlay = () => {
    window.clearInterval(timer.current)
    timer.current = undefined
    setPlaying(false)
  }

  // Single source of truth: jump to transcript position n by replaying 0..n.
  const goTo = (n: number) => {
    const c = Math.max(0, Math.min(n, SCRIPT.length))
    stepRef.current = c
    setStep(c)
    engine.replay(SCRIPT, c)
  }

  const startSession = () => goTo(0)
  const endSession = () => {
    stopPlay()
    speech?.stop()
    setMic('idle')
    engine.stop()
    stepRef.current = 0
    setStep(0)
  }

  const stepOnce = () => {
    if (stepRef.current >= SCRIPT.length) {
      stopPlay()
      return
    }
    goTo(stepRef.current + 1)
  }

  const play = () => {
    setPlaying(true)
    goTo(stepRef.current >= SCRIPT.length ? SCRIPT.length : stepRef.current + 1)
    timer.current = window.setInterval(() => {
      if (stepRef.current >= SCRIPT.length) {
        stopPlay()
        return
      }
      goTo(stepRef.current + 1)
    }, STEP_MS)
  }

  const toggleMic = () => {
    if (!speech) return
    if (!running) startSession()
    if (speech.running) speech.stop()
    else speech.start()
  }

  return (
    <div className="panel">
      <header className="brand">
        <h1>intermeow</h1>
        <span className="tag">live interview canvas</span>
      </header>

      {/* transport */}
      <div className="controls">
        {!running ? (
          <button className="btn primary" onClick={startSession}>
            Start session
          </button>
        ) : (
          <button className="btn danger" onClick={endSession}>
            End session
          </button>
        )}
        <button
          className={playing ? 'btn danger' : 'btn'}
          onClick={playing ? stopPlay : play}
          disabled={!running && playing}
        >
          {playing ? '■ Stop' : '▶ Play interview'}
        </button>
        <button className="btn" onClick={stepOnce} disabled={playing || step >= SCRIPT.length}>
          Next line
        </button>
      </div>

      {/* Draggable timeline — scrub the transcript back and forth */}
      <div className="timeline">
        <input
          className="scrubber"
          type="range"
          min={0}
          max={SCRIPT.length}
          step={1}
          value={step}
          onChange={(e) => {
            stopPlay()
            goTo(Number(e.target.value))
          }}
        />
        <div className="timeline-labels muted small">
          <button className="link-btn" onClick={() => goTo(step - 1)} disabled={step === 0}>
            ◀
          </button>
          <span>
            line {step} / {SCRIPT.length}
          </span>
          <button
            className="link-btn"
            onClick={() => goTo(step + 1)}
            disabled={step >= SCRIPT.length}
          >
            ▶
          </button>
        </div>
      </div>

      {/* live guidance */}
      {running && (
        <>
          <Section label="now discussing">
            {state.activeId ? (
              <div className="chip-active">{engine.labelOf(state.activeId)}</div>
            ) : (
              <span className="muted small">— waiting for a match —</span>
            )}
            {state.lastHeard && (
              <div className="heard muted small">heard: “{state.lastHeard}”</div>
            )}
          </Section>

          <Section label={`path so far (${state.asked.length})`} accent="path">
            {state.asked.length === 0 && <span className="muted small">—</span>}
            {state.asked.map((id, i) => {
              const treeId = engine.treeIdOf(id)
              const prevTree = i > 0 ? engine.treeIdOf(state.asked[i - 1]) : undefined
              const switched = treeId && treeId !== prevTree
              return (
                <div key={id}>
                  {switched && (
                    <div className="tree-switch muted small">
                      ↪ {engine.treeTitle(treeId!)}
                    </div>
                  )}
                  <div className="row path">
                    <span className="step-num">{i + 1}</span>
                    {engine.labelOf(id)}
                  </div>
                </div>
              )
            })}
          </Section>

          {state.anticipated.length > 0 && (
            <Section label="signalling — heading toward" accent="anticipate">
              {state.anticipated.map((a) => (
                <div className="row anticipate" key={`${a.kind}-${a.nodeId}`}>
                  {a.kind === 'bridge' ? (
                    <>
                      <span className="anti-tag">bridge forming</span> {a.label}
                      {a.fromNodeId && (
                        <span className="muted small"> · from “{engine.labelOf(a.fromNodeId)}”</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="anti-tag">likely next</span> {a.label}
                    </>
                  )}
                </div>
              ))}
            </Section>
          )}

          {(() => {
            const antiIds = new Set(state.anticipated.map((a) => a.nodeId))
            const nexts = state.suggested.filter((id) => !antiIds.has(id))
            return (
              <Section label={`next questions (${nexts.length})`} accent="next">
                {nexts.length === 0 && <span className="muted small">—</span>}
                {nexts.map((id) => (
                  <div className="row next" key={id}>
                    → {engine.labelOf(id)}
                  </div>
                ))}
              </Section>
            )
          })()}

          <Section label={`gaps — asked around, skipped (${state.gaps.length})`} accent="gap">
            {state.gaps.length === 0 && <span className="muted small">none yet</span>}
            {state.gaps.map((id) => (
              <div className="row gap" key={id}>
                ⚠ {engine.labelOf(id)}
              </div>
            ))}
          </Section>

          <Section label={`bridges between trees (${state.bridges.length})`} accent="bridge">
            {state.bridges.length === 0 && <span className="muted small">none yet</span>}
            {state.bridges.map((id) => {
              const br = engine.bridgeById(id)
              return (
                <div className="row bridge" key={id}>
                  🌉 {br?.question}
                </div>
              )
            })}
          </Section>

          <Section
            label={`from past interviews (${state.ghosts.length})`}
            accent="ghost"
          >
            {state.ghosts.length === 0 && (
              <span className="muted small">gathering data…</span>
            )}
            {state.ghosts.map((id) => {
              const pq = engine.pastById(id)
              const trigger = state.ghostTriggers[id]
              return (
                <div className="row ghost" key={id}>
                  <div>
                    💡 {pq?.question}
                    <span className="muted small"> · seen in {pq?.seenIn}</span>
                  </div>
                  {trigger && (
                    <div className="ghost-trigger muted small">prompted by: “{trigger}”</div>
                  )}
                </div>
              )
            })}
          </Section>
        </>
      )}

      {/* manual + mic input */}
      <div className="input-row">
        <input
          className="line-input"
          placeholder={running ? 'type a line, press Enter…' : 'start a session first'}
          value={manual}
          disabled={!running}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manual.trim()) {
              engine.ingest(manual.trim(), 'interviewer')
              setManual('')
            }
          }}
        />
        {isSupported() && (
          <button className="btn" onClick={toggleMic} disabled={!running}>
            {speech?.running ? `● ${mic}` : 'Mic'}
          </button>
        )}
      </div>
    </div>
  )
}

function Section({
  label,
  accent,
  children,
}: {
  label: string
  accent?: string
  children: React.ReactNode
}) {
  return (
    <section className={`sec${accent ? ` sec-${accent}` : ''}`}>
      <div className="sec-label">{label}</div>
      <div className="sec-body">{children}</div>
    </section>
  )
}
