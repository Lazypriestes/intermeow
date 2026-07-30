import type { Bridge, InterviewTree, PastQuestion } from './types'

/**
 * The demo interview brain: three question trees, cross-tree bridges, and a
 * pool of past-interview questions. Coordinates are page-space; trees are laid
 * out in vertical columns so branches read top-to-bottom.
 */

export const TREES: InterviewTree[] = [
  {
    id: 'workflow',
    title: 'Current workflow',
    color: 'blue',
    root: 'wf-open',
    nodes: [
      {
        id: 'wf-open', treeId: 'workflow', x: 80, y: 120, must: true,
        question: 'Walk me through your current workflow',
        keywords: ['workflow', 'process', 'typical day', 'routine', 'morning', 'steps'],
        children: ['wf-break', 'wf-tools'],
      },
      {
        id: 'wf-break', treeId: 'workflow', x: -180, y: 340, must: true,
        question: 'Where does it break down?',
        keywords: ['break', 'break down', 'breaks down', 'friction', 'slow', 'stuck', 'bottleneck', 'waiting'],
        children: ['wf-often', 'wf-workaround'],
      },
      {
        id: 'wf-tools', treeId: 'workflow', x: 200, y: 340,
        question: 'What tools do you use for it?',
        keywords: ['tool', 'tools', 'software', 'app', 'spreadsheet', 'system', 'platform'],
        children: [],
      },
      {
        id: 'wf-often', treeId: 'workflow', x: -320, y: 560,
        question: 'How often does that happen?',
        keywords: ['often', 'frequency', 'daily', 'times', 'week', 'every'],
        children: [],
      },
      {
        id: 'wf-workaround', treeId: 'workflow', x: -60, y: 560, must: true,
        question: 'What do you do when it happens?',
        keywords: ['workaround', 'instead', 'manual', 'copy', 'paste', 'cope', 'hack'],
        children: [],
      },
    ],
  },
  {
    id: 'collab',
    title: 'Collaboration',
    color: 'green',
    root: 'cl-open',
    nodes: [
      {
        id: 'cl-open', treeId: 'collab', x: 760, y: 120, must: true,
        question: 'How do you work with your team?',
        keywords: ['team', 'collaborate', 'colleague', 'together', 'coworker', 'we'],
        children: ['cl-handoff', 'cl-decide'],
      },
      {
        id: 'cl-handoff', treeId: 'collab', x: 620, y: 340, must: true,
        question: 'Where do handoffs happen?',
        keywords: ['handoff', 'handoffs', 'pass', 'share', 'send', 'review', 'back and forth'],
        children: ['cl-lost'],
      },
      {
        id: 'cl-decide', treeId: 'collab', x: 940, y: 340,
        question: 'How does this affect the time needed to finish a case?',
        keywords: ['affect', 'finish', 'case', 'deadline', 'delay', 'time needed'],
        children: [],
      },
      {
        id: 'cl-lost', treeId: 'collab', x: 620, y: 560, must: true,
        question: 'What gets lost in the handoffs?',
        keywords: ['lost', 'miss', 'unclear', 'context', 'dropped', 'gets lost'],
        children: [],
      },
    ],
  },
  {
    id: 'impact',
    title: 'Impact',
    color: 'violet',
    root: 'im-ideal',
    nodes: [
      {
        id: 'im-ideal', treeId: 'impact', x: 1480, y: 120,
        question: 'Where does your time actually go in a typical week?',
        keywords: ['time', 'week', 'typical', 'spend', 'goes', 'day', 'hours'],
        children: ['im-cost', 'im-parallel'],
      },
      {
        id: 'im-cost', treeId: 'impact', x: 1340, y: 360, must: true,
        question: 'How long does a typical case stay open?',
        keywords: ['long', 'case', 'stay', 'open', 'duration', 'weeks', 'close'],
        children: [],
      },
      {
        id: 'im-parallel', treeId: 'impact', x: 1640, y: 360,
        question: 'How many cases do you have open in parallel?',
        keywords: ['many', 'cases', 'parallel', 'open', 'juggle', 'concurrent', 'load'],
        children: [],
      },
    ],
  },
]

/** Questions that logically connect two trees. */
export const BRIDGES: Bridge[] = [
  {
    id: 'br-break-handoff',
    from: 'wf-break', to: 'cl-handoff',
    question: 'Do those breakdowns happen during handoffs?',
    keywords: ['handoff', 'between', 'break', 'waiting on', 'other people'],
  },
  {
    id: 'br-workaround-time',
    from: 'wf-workaround', to: 'im-ideal',
    question: 'Do these workarounds eat into where your week goes?',
    keywords: ['time', 'week', 'eat into', 'goes', 'hours'],
  },
]

/** Mined from past interviews — not in any tree yet, but they fit somewhere. */
export const PAST_QUESTIONS: PastQuestion[] = [
  // Keywords here match what an INTERVIEWEE says in an answer — that answer is
  // what surfaces the past-interview question, contextually.
  {
    id: 'pq-lostwork', fitsNear: 'wf-break', seenIn: 4,
    question: 'Have you ever lost work redoing that by hand?',
    // triggered by: "…a manual workaround — copy, paste, do it by hand instead."
    keywords: ['manual', 'copy', 'paste', 'by hand', 'redo', 'again'],
    x: -560, y: 470,
  },
  {
    id: 'pq-asyncmeeting', fitsNear: 'cl-handoff', seenIn: 3,
    question: 'Is that async or in a meeting?',
    // triggered by: "We share files back and forth, lots of handoffs…"
    keywords: ['share', 'back and forth', 'files', 'send', 'swap'],
    x: 1140, y: 570,
  },
  {
    id: 'pq-trigger', fitsNear: 'wf-open', seenIn: 5,
    question: 'What triggers you to start each morning?',
    // triggered by: "Every morning I pull the numbers together…"
    keywords: ['morning', 'every', 'routine', 'start', 'begin'],
    x: 430, y: -50,
  },
]

/**
 * A curated interview transcript. Deliberately asks some questions and skips
 * others (leaving gaps), and hits bridge + past-interview themes. Each line is
 * fed to the engine one at a time. Alternating speakers drive the captions.
 */
export interface ScriptLine {
  speaker: 'interviewer' | 'interviewee'
  text: string
}

export const SCRIPT: ScriptLine[] = [
  { speaker: 'interviewer', text: "So, walk me through your current workflow — what does a typical day look like?" },
  { speaker: 'interviewee', text: "Every morning I pull the numbers together and run the same process." },
  { speaker: 'interviewer', text: "Okay, and where does that process break down for you?" },
  { speaker: 'interviewee', text: "Honestly it gets really slow, I end up stuck waiting on other people." },
  { speaker: 'interviewer', text: "When that happens, what do you actually do?" },
  { speaker: 'interviewee', text: "I just do a manual workaround — copy, paste, do it by hand instead." },
  { speaker: 'interviewer', text: "Zooming out — where does your time actually go in a typical week?" },
  { speaker: 'interviewee', text: "Way too much of it — a case just drags on and on." },
  { speaker: 'interviewer', text: "How long does a typical case stay open?" },
  { speaker: 'interviewee', text: "Some stay open for weeks before they finally close." },
  { speaker: 'interviewer', text: "And how many cases are you juggling open in parallel?" },
  { speaker: 'interviewee', text: "About a dozen cases open at once, easily." },
  { speaker: 'interviewer', text: "Let's switch to your team — how do you collaborate with them?" },
  { speaker: 'interviewee', text: "We share files back and forth, lots of handoffs between us." },
  { speaker: 'interviewer', text: "What tends to get lost in those handoffs?" },
  { speaker: 'interviewee', text: "The context gets dropped — people miss why we did something." },
]
