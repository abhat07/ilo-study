/**
 * Add a lecture's recording transcript straight from the lecture (no need to rename the file).
 * Panopto/Teams exports: captions (.vtt/.srt), plain text with or without timestamps (.txt), or Word (.docx).
 */
import { byModule, notifyChange } from '../db';
import { ingestFiles, mapModule } from '../ingest/pipeline';
import type { Lecture } from '../types';
import { buildLectures } from './lectures';
import { isTranscript, redoUnstartedSections } from './sections';

export const TRANSCRIPT_ACCEPT = '.vtt,.srt,.txt,.docx';

/** The lecture's transcript files. */
export async function transcriptsOf(lecture: Lecture): Promise<string[]> {
  const files = await byModule('files', lecture.moduleId);
  return files.filter((f) => f.status === 'active' && lecture.fileIds.includes(f.id) && isTranscript(f)).map((f) => f.name);
}

export async function addTranscript(lecture: Lecture, file: File, progress: (m: string) => void = () => {}): Promise<string> {
  if (!lecture.number) throw new Error('Give this lecture a number first (Edit lectures).');
  const ext = file.name.toLowerCase().split('.').pop() ?? 'txt';
  // name it so it is filed under this lecture: other numbers in the original name (dates, codes) are dropped
  const rest = file.name.replace(/\.[^.]+$/, '').replace(/\d+/g, ' ').replace(/[_\s.-]+/g, ' ').trim();
  const named = new File([file], `L${lecture.number} transcript${rest ? ` - ${rest}` : ''}.${ext}`, { type: file.type });
  const { results } = await ingestFiles(lecture.moduleId, [named], progress);
  const r = results[0];
  if (!r || r.outcome === 'error' || r.outcome === 'unsupported' || r.outcome === 'empty') throw new Error(r?.detail || 'Could not read that file.');
  if (r.outcome === 'duplicate') return 'That transcript is already uploaded.';
  progress('Matching the transcript to the ILOs…');
  const m = await mapModule(lecture.moduleId, progress).catch(() => null);
  await buildLectures(lecture.moduleId);
  // lessons in this lecture you haven't started are rewritten to use the lecturer's words too
  const redo = await redoUnstartedSections(lecture.moduleId, lecture.id);
  notifyChange();
  return `🎙 Transcript added to Lecture ${lecture.number}${redo ? `: ${redo} unstarted lesson section${redo === 1 ? '' : 's'} will be rewritten with it` : ''}.` +
    (m?.by === 'lexical' ? ' (Matched to ILOs with the free keyword method.)' : '');
}
