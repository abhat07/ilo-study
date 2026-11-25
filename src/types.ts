import type { Card } from 'ts-fsrs';

/** Where a passage lives in the original material. */
export type Locator =
  | { kind: 'slide'; slide: number }
  | { kind: 'page'; page: number }
  | { kind: 'time'; start: number; end: number } // seconds into the recording
  | { kind: 'section'; section: number };

export interface Module {
  id: string; // e.g. LIFE50016
  short: string; // e.g. AMB
  name: string;
  createdAt: number;
  /** last change to this record (sync: newest wins) */
  updatedAt?: number;
  /** when the ILO list was last confirmed (sync: newest list wins as a whole) */
  ilosAt?: number;
  /** none = no ILOs yet; pending = parsed, awaiting the student's confirmation; confirmed = content can be generated */
  iloStatus: 'none' | 'pending' | 'confirmed';
}

export interface SourceFile {
  id: string;
  moduleId: string;
  name: string;
  kind: 'pdf' | 'pptx' | 'docx' | 'transcript' | 'text';
  size: number;
  hash: string; // sha-256 of bytes
  uploadedAt: number;
  /** true when this file was found to hold the module's ILO list */
  hasIlos: boolean;
  /** Latest version of a file with this name is active; older versions are kept as history. */
  /** active = in use; superseded = replaced by a newer upload; removed = deleted by you (passages and questions retired, answers kept) */
  status: 'active' | 'superseded' | 'removed';
  removedAt?: number;
  version: number;
  chunkCount: number;
  ocrCount: number;
  blob?: Blob; // original bytes, kept so the slide can be shown again
}

export interface Chunk {
  id: string; // `${fileName}|${locatorKey}` - stable across re-uploads of the same file name
  moduleId: string;
  fileId: string;
  fileName: string;
  locator: Locator;
  text: string;
  hash: string; // hash of normalised text
  ocr: boolean; // contains OCR'd text
  iloIds: string[];
  mappedBy: 'ai' | 'lexical' | 'none';
  status: 'active' | 'changed' | 'removed';
  updatedAt: number;
}

export interface Ilo {
  id: string; // e.g. AMB-07
  moduleId: string;
  text: string;
  lecture: string; // free text grouping label, e.g. "L3 PCR" (may be empty)
  order: number;
  sourceChunkId?: string;
}

export type ItemType = 'mcq' | 'cloze' | 'short' | 'order';

export interface RubricPoint {
  point: string;
  marks: number;
}

export interface SourceRef {
  chunkId: string;
  fileName: string;
  locator: Locator;
  quote: string; // verbatim text from the passage the item is built on
  chunkHash: string; // hash of the passage when the item was generated
}

export interface Item {
  id: string;
  moduleId: string;
  iloIds: string[];
  type: ItemType;
  level: 1 | 2 | 3; // 1 recall, 2 explain, 3 apply/transfer
  transfer: boolean;
  prompt: string;
  options: string[]; // mcq
  correctIndex: number; // mcq
  distractorWhy: string[]; // mcq: why each option is right/wrong
  answer: string; // model answer / cloze answer
  acceptedAnswers: string[]; // cloze alternatives
  steps: string[]; // order: correct order
  explanation: string;
  rubric: RubricPoint[]; // short
  elaborationPrompt: string; // "why does this happen?"
  elaborationAnswer: string;
  beyondMaterials: string; // optional extra context, clearly labelled, never graded
  source: SourceRef;
  cacheKey: string;
  model: string;
  createdAt: number;
  /** active = can be served; flagged = source changed or disputed, held back; retired = superseded */
  status: 'active' | 'flagged' | 'retired';
  flagReason?: string;
  card: Card; // FSRS state
  seenCount: number;
  /** lesson questions: which lecture/section/point they test; 'link' questions connect to earlier points */
  lectureId?: string;
  sectionId?: string;
  kind?: 'point' | 'link';
  pointIndex?: number;
}

export type Confidence = 1 | 2 | 3 | 4; // guessing, unsure, fairly sure, certain

export interface MarkDetail {
  by: 'auto' | 'ai' | 'self';
  score: number; // 0..1
  points?: { point: string; awarded: boolean; reasoning: string }[];
  reasoning?: string;
  confidence?: 'low' | 'medium' | 'high';
  feedback?: string;
}

export interface Attempt {
  id: string;
  itemId: string;
  moduleId: string;
  iloIds: string[];
  sessionId: string;
  at: number;
  confidence: Confidence;
  response: string;
  score: number; // 0..1
  firstExposure: boolean; // first time this student saw this item
  transfer: boolean;
  level: 1 | 2 | 3;
  durationMs: number;
  mark: MarkDetail;
  disputed?: boolean;
  /** self-explanation prompt answered after the main question; logged, not used for mastery */
  elaboration?: boolean;
  /** the help chat was used before answering: counts as weaker evidence and a shorter review interval */
  hinted?: boolean;
}

export interface Dispute {
  id: string;
  attemptId: string;
  itemId: string;
  moduleId: string;
  at: number;
  reason: string;
  originalScore: number;
  status: 'open' | 'accepted';
}

export interface SessionRecord {
  id: string;
  moduleId: string;
  startedAt: number;
  endedAt?: number;
  attemptIds: string[];
  masteryBefore: Record<string, number>;
  masteryAfter?: Record<string, number>;
}

export interface SpendRecord {
  id: string;
  at: number;
  month: string; // YYYY-MM
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costGBP: number;
}

/** Records every generation request so the same passage+ILO is never paid for twice, even when it yielded nothing usable. */
export interface GenLog {
  cacheKey: string;
  moduleId: string;
  at: number;
  accepted: number;
  rejected: number;
  rejectReasons: string[];
}

export interface IngestEvent {
  id: string;
  moduleId: string;
  at: number;
  fileName: string;
  summary: string;
}

/** A lecture: its files (slides, transcript) and the ILOs it teaches. Built automatically, editable. */
export interface Lecture {
  id: string;
  moduleId: string;
  number: number; // 0 = material not tied to a numbered lecture
  title: string;
  fileIds: string[];
  iloIds: string[];
  updatedAt: number;
  /** true once you rename or reassign things, so automatic rebuilding leaves your choices alone */
  userEdited?: boolean;
}

/** One verified statement in a lesson explanation. */
export interface LearnPoint {
  text: string;
  quote: string; // verbatim from the passage
  chunkId: string;
  label?: string; // 1-4 word step heading, e.g. "Denaturation"
  visualItem?: number; // which item of the section's diagram this step is (-1/undefined: none)
}

export interface Visual {
  kind: 'process' | 'cycle' | 'compare' | 'parts' | 'none';
  title: string;
  /** compare: column headings; others: unused */
  columns: string[];
  items: { label: string; detail: string }[];
}

/** One ILO's lesson inside a lecture: explanation + visual + its questions. */
export interface LearnSection {
  id: string;
  moduleId: string;
  lectureId: string;
  iloId: string;
  order: number;
  title: string;
  intro: string;
  points: LearnPoint[];
  visual: Visual;
  chunkIds: string[];
  itemIds: string[];
  seenAt?: number; // every step read
  readTo?: number; // steps read so far (step-by-step lessons)
  v?: number; // 2 = step-by-step format with link-back questions
  updatedAt: number;
}

/** A picture from a PowerPoint slide, shrunk for display. Blob is local; other devices fetch it on demand. */
export interface SlideImage {
  id: string;
  moduleId: string;
  fileId: string;
  chunkId: string;
  slide: number;
  hash: string; // sha-256 of the shrunk JPEG: also its name in the sync repo (img/<hash>.jpg)
  w: number;
  h: number;
  status: 'active' | 'removed';
  uploaded?: boolean; // in the sync repo
  pruned?: boolean; // deleted from the sync repo after removal
  updatedAt: number;
  blob?: Blob;
}
