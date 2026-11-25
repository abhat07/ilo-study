import { useState } from 'preact/hooks';
import { byModule, db } from '../db';
import { resetProgress } from '../sync/reset';
import { syncNow, syncSettings } from '../sync/sync';
import { isDemo } from '../mode';
import { useLive } from './common';

/** Settings card: clear all study progress, keep every upload, ILO, lecture, question and lesson. */
export function StartAgain({ onBackup }: { onBackup: () => Promise<void> }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle');
  const [result, setResult] = useState('');
  const counts = useLive(async () => {
    const d = await db();
    const [attempts, sessions] = await Promise.all([d.count('attempts'), d.count('sessions')]);
    const mods = await d.getAll('modules');
    let files = 0;
    for (const m of mods) files += (await byModule('files', m.id)).filter((f) => f.status === 'active').length;
    return { attempts, sessions, files };
  });

  const go = async () => {
    setStep('busy');
    const n = await resetProgress();
    setResult(`Cleared ${n} answer${n === 1 ? '' : 's'}.${syncSettings.configured() ? ' Syncing the reset to your other devices…' : ''}`);
    setStep('done');
    if (syncSettings.configured()) {
      await syncNow('progress reset');
      setResult(`Cleared ${n} answer${n === 1 ? '' : 's'}. Your other devices clear theirs the next time they sync (when you open the app there).`);
    }
  };

  return (
    <div class="card">
      <h2>🧹 Start again</h2>
      <p class="small">
        Clears everything you've answered: every answer, study session and dispute, each question's review schedule,
        lesson progress (steps read, rings), mastery, XP, level, streak, badges and your reef (it regrows as you answer).
      </p>
      <p class="small muted">
        Keeps all your uploads{counts ? ` (${counts.files} files)` : ''}, ILOs, lectures, questions and lessons, and the
        spend log. {isDemo() ? 'In demo mode this only clears the demo.' : 'Applies to all your synced devices.'} It can't be
        undone except by restoring a backup file.
      </p>
      {step === 'idle' && (
        <button class="btn danger" disabled={!counts || (counts.attempts === 0 && counts.sessions === 0)} onClick={() => setStep('confirm')}>
          {counts && counts.attempts === 0 && counts.sessions === 0 ? 'Nothing to clear' : 'Clear my progress…'}
        </button>
      )}
      {step === 'confirm' && (
        <div class="confirm-box">
          <p class="small"><b>Delete {counts?.attempts ?? 0} answers and {counts?.sessions ?? 0} sessions?</b> Your uploads stay.</p>
          <div class="row">
            <button class="btn sm" onClick={() => void onBackup()}>Download a backup first</button>
            <button class="btn sm danger" onClick={() => void go()}>Yes, clear my progress</button>
            <button class="btn sm ghost" onClick={() => setStep('idle')}>Cancel</button>
          </div>
        </div>
      )}
      {step === 'busy' && <p class="small muted">Clearing…</p>}
      {step === 'done' && <div class="okbox small">{result}</div>}
    </div>
  );
}
