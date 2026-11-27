import { useState } from 'preact/hooks';
import type { Lecture } from '../types';
import { addTranscript, TRANSCRIPT_ACCEPT, transcriptsOf } from '../learn/transcript';
import { useLive } from './common';
import { toast } from './fun';

/** "🎙 Transcript ✓" or a button to add the lecture's recording transcript. */
export function TranscriptButton({ lecture, compact }: { lecture: Lecture; compact?: boolean }) {
  const have = useLive(() => transcriptsOf(lecture), [lecture.id, lecture.fileIds.join()]);
  const [busy, setBusy] = useState('');
  if (!have || !lecture.number) return null;
  const pick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setBusy('Reading…');
    try {
      toast(await addTranscript(lecture, f, setBusy));
    } catch (err) {
      toast(`Couldn't add it: ${(err as Error).message}`);
    } finally {
      setBusy('');
    }
  };
  if (busy) return <span class="small muted tr-btn">🎙 {busy}</span>;
  return (
    <label class={'tr-btn small' + (have.length ? ' have' : '')} title={have.length ? `Transcript: ${have.join(', ')}. Add another (e.g. a second recording).` : 'Add the recording transcript (VTT, SRT, TXT or DOCX) so lessons use the lecturer\'s explanations too'}>
      {have.length ? (compact ? '🎙 ✓' : '🎙 Transcript added') : compact ? '＋ 🎙 transcript' : '＋ 🎙 Add the recording transcript'}
      <input type="file" accept={TRANSCRIPT_ACCEPT} onChange={pick} hidden />
    </label>
  );
}
