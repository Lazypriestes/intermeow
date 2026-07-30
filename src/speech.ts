/**
 * Thin wrapper over the Web Speech API (webkitSpeechRecognition).
 *
 * Continuous mode, only final results are committed — interim results fire
 * constantly and would thrash the matcher. Chrome/Edge/Safari only; Firefox has
 * no support, so `isSupported()` gates the UI.
 */

// The API is not in the TS DOM lib in a stable form; declare what we use.
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResult {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: {
    length: number
    [i: number]: SpeechRecognitionResult
  }
}
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    webkitSpeechRecognition?: SpeechRecognitionCtor
    SpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSupported(): boolean {
  return getCtor() !== null
}

export interface SpeechController {
  start(): void
  stop(): void
  readonly running: boolean
}

/**
 * @param onFinal   called with each finalized utterance
 * @param onStatus  called on state changes / errors for UI
 */
export function createSpeech(
  onFinal: (text: string) => void,
  onStatus?: (s: 'listening' | 'stopped' | string) => void,
): SpeechController | null {
  const Ctor = getCtor()
  if (!Ctor) return null

  const rec = new Ctor()
  rec.continuous = true
  rec.interimResults = false // final results only
  rec.lang = 'en-US'

  let running = false
  let wantRunning = false

  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) {
        const text = r[0].transcript.trim()
        if (text) onFinal(text)
      }
    }
  }
  rec.onerror = (e) => {
    onStatus?.(e.error ?? 'error')
  }
  // Chrome stops after silence; restart if the user still wants it on.
  rec.onend = () => {
    running = false
    if (wantRunning) {
      try {
        rec.start()
        running = true
      } catch {
        onStatus?.('stopped')
      }
    } else {
      onStatus?.('stopped')
    }
  }

  return {
    start() {
      if (running) return
      wantRunning = true
      try {
        rec.start()
        running = true
        onStatus?.('listening')
      } catch {
        /* start() throws if already started; ignore */
      }
    },
    stop() {
      wantRunning = false
      rec.stop()
    },
    get running() {
      return running
    },
  }
}
