import { useEffect, useState } from 'react'
import type { Engine, EngineState } from './engine'

/**
 * Movie-style subtitle overlay pinned to the bottom of the canvas. Shows the
 * latest heard line, colored by speaker (interviewer vs interviewee).
 */
export function Caption({ engine }: { engine: Engine }) {
  const [state, setState] = useState<EngineState | null>(null)
  useEffect(() => engine.subscribe(setState), [engine])

  if (!state || !state.running || !state.lastHeard) return null

  return (
    <div className="caption-wrap">
      <div className={`caption caption-${state.lastSpeaker}`}>
        <span className="caption-who">
          {state.lastSpeaker === 'interviewer' ? 'Interviewer' : 'Interviewee'}
        </span>
        <span className="caption-text">{state.lastHeard}</span>
      </div>
    </div>
  )
}
