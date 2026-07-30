import { useCallback, useRef, useState } from 'react'
import { Tldraw, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import './App.css'
import { Canvas } from './canvas'
import { Engine } from './engine'
import { BRIDGES, PAST_QUESTIONS, TREES } from './trees'
import { Sidebar } from './Sidebar'
import { Caption } from './Caption'

// This is a guided interview viewer, not a drawing tool — hide the authoring
// chrome that would otherwise cover the trees.
const components: TLComponents = {
  StylePanel: null,
  MainMenu: null,
  PageMenu: null,
  QuickActions: null,
}

export default function App() {
  const [engine, setEngine] = useState<Engine | null>(null)
  const canvasRef = useRef<Canvas | null>(null)

  const onMount = useCallback((ed: Editor) => {
    const canvas = new Canvas(ed)
    canvasRef.current = canvas
    canvas.seed(TREES)
    const eng = new Engine(canvas, TREES, BRIDGES, PAST_QUESTIONS)
    setEngine(eng)
    if (import.meta.env.DEV) {
      Object.assign(window, { editor: ed, canvas, engine: eng })
    }
  }, [])

  return (
    <div className="app">
      <div className="board">
        <Tldraw onMount={onMount} components={components} />
        {engine && <Caption engine={engine} />}
      </div>
      <aside className="sidebar">{engine && <Sidebar engine={engine} />}</aside>
    </div>
  )
}
