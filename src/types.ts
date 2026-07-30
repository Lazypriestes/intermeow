/**
 * intermeow data model.
 *
 * The interview "brain" is a set of QUESTION TREES. Each tree is a topic area;
 * within it, questions branch — asking one opens its children as the logical
 * next steps. BRIDGES connect nodes across different trees. A PAST-INTERVIEW
 * pool holds questions that aren't in any tree yet but have fit a given
 * location in previous interviews.
 *
 * These are LOGICAL ids (stable strings like "wf-break"). The canvas layer maps
 * each logical id to a live tldraw shape id — see canvas.ts.
 */

/** Runtime status of a question, derived by the engine during a session. */
export type QState =
  | 'pending' // in the tree, not reached
  | 'active' // being discussed right now
  | 'asked' // covered earlier
  | 'suggested' // a logical next question the AI is proposing now
  | 'gap' // an unasked child of an asked node — interview moved on without it

export interface QNode {
  id: string
  treeId: string
  question: string
  /** Words/phrases that, heard in the transcript, mean this question is live. */
  keywords: string[]
  /** Logical next questions — the branches out of this node. */
  children: string[]
  /** Must-ask questions surface louder as gaps when skipped. */
  must?: boolean
  x: number
  y: number
}

export interface InterviewTree {
  id: string
  title: string
  /** tldraw color name used for this tree's nodes/edges. */
  color: string
  root: string
  nodes: QNode[]
}

/** A question that logically links two different trees. */
export interface Bridge {
  id: string
  from: string // node id (tree A)
  to: string // node id (tree B)
  question: string
  keywords: string[]
}

/** A question mined from past interviews, not yet in the tree. */
export interface PastQuestion {
  id: string
  question: string
  keywords: string[]
  /** The node this question has historically fit next to. */
  fitsNear: string
  /** How many past interviews asked something like this here. */
  seenIn: number
  /** Explicit page position, placed in an empty margin to avoid overlap. */
  x: number
  y: number
}

export interface LiveLine {
  text: string
  at: number
}
