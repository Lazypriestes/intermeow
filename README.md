# intermeow

Live-interview canvas prototype. During an interview, transcript is perceived
live and walked against pre-built **question trees** on an infinite canvas. As
each question gets asked, the tool lights up the logical **next** questions,
flags **gaps** (asked-around, skipped), draws **bridges** between trees, and
surfaces questions from **past interviews** that fit the current spot.

## Stack
- React 19 + Vite + TypeScript
- [tldraw](https://tldraw.dev) for the infinite canvas
- Deterministic keyword matcher (the seam where an embedding model slots in later)

## Run
```bash
npm install
npm run dev
```

Click **Play interview** to auto-play the scripted transcript, or **Next line**
to step. Type a line + Enter, or use **Mic** (Web Speech API, Chrome/Edge/Safari)
for live speech.

## How it fits together
| File | Role |
| --- | --- |
| `src/trees.ts` | The interview "brain": question trees, bridges, past-interview pool, scripted transcript |
| `src/types.ts` | Data model (nodes, branches, bridges, past questions) |
| `src/matcher.ts` | Keyword-overlap scorer (swap for embeddings later) |
| `src/engine.ts` | Progression logic — asked / next / gaps / bridges / ghosts |
| `src/canvas.ts` | Maps logical nodes to tldraw shapes; renders all state as real shapes |
| `src/Sidebar.tsx` | Transport controls + live guidance panel |

## Visual language on the canvas
- **outline color** — which tree a question belongs to (blue / green / violet)
- **filled node** — question was asked
- **solid blue ring** — active (being discussed now)
- **dashed blue ring** — suggested next question
- **dashed orange ring** — gap (skipped)
- **violet dashed arrow + card** — bridge between two trees
- **dotted grey node** — a past-interview question that fits here

## Demo determinism
The transcript, trees, and keywords are tuned so the scripted run always lands
the same end-state: 7 asked, 3 gaps, 2 bridges, 3 past-interview suggestions.
Speech and matching are the swappable seams for a real build.
