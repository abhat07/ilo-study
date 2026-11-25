/** Fix the automatic grouping: rename lectures and move files or ILOs between them. */
import { useEffect, useState } from 'preact/hooks';
import { byModule, db, notifyChange } from '../db';
import type { Ilo, Lecture, SourceFile } from '../types';
import { buildLectures, saveLecture } from '../learn/lectures';
import { Spinner, TopBar, go } from './common';
import { Doodles } from './Doodles';

export function LectureEdit({ moduleId }: { moduleId: string }) {
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [ilos, setIlos] = useState<Ilo[]>([]);
  const [saved, setSaved] = useState('');

  const load = async () => {
    const ls = await buildLectures(moduleId);
    setLectures(ls.map((l) => ({ ...l })));
    setFiles((await byModule('files', moduleId)).filter((f) => f.status === 'active'));
    setIlos((await byModule('ilos', moduleId)).sort((a, b) => a.order - b.order));
  };
  useEffect(() => { void load(); }, [moduleId]);

  if (!lectures) return <><TopBar title="Edit lectures" back={`/m/${moduleId}`} /><div class="wrap"><Spinner /></div></>;

  const lectureOf = (kind: 'fileIds' | 'iloIds', id: string) => lectures.find((l) => l[kind].includes(id))?.id ?? '';
  const move = (kind: 'fileIds' | 'iloIds', id: string, to: string) => {
    setLectures(lectures.map((l) => {
      const has = l[kind].includes(id);
      if (l.id === to && !has) return { ...l, [kind]: [...l[kind], id], userEdited: true };
      if (l.id !== to && has && kind === 'iloIds') return { ...l, iloIds: l.iloIds.filter((x) => x !== id), userEdited: true };
      if (l.id !== to && has && kind === 'fileIds') return { ...l, fileIds: l.fileIds.filter((x) => x !== id), userEdited: true };
      return l;
    }));
  };
  const addLecture = () => {
    const used = new Set(lectures.map((l) => l.number));
    let n = 1;
    while (used.has(n)) n++;
    setLectures([...lectures, { id: `${moduleId}-L${n}`, moduleId, number: n, title: `Lecture ${n}`, fileIds: [], iloIds: [], updatedAt: Date.now(), userEdited: true }]);
  };
  const save = async () => {
    for (const l of lectures) if (l.userEdited) await saveLecture(l);
    setSaved('Saved. Lessons follow the new grouping; sections already written for moved ILOs stay where they were taught.');
  };
  const reset = async () => {
    if (!confirm('Forget your changes and group lectures automatically again?')) return;
    const d = await db();
    for (const l of await byModule('lectures', moduleId)) await d.put('lectures', { ...l, userEdited: false, updatedAt: Date.now() });
    notifyChange();
    await load();
    setSaved('Regrouped automatically.');
  };
  const sorted = [...lectures].sort((a, b) => (a.number || 999) - (b.number || 999));

  return (
    <div class="has-doodles">
      <Doodles set="settings" />
      <TopBar title="Edit lectures" back={`/m/${moduleId}`} />
      <div class="wrap">
        <div class="card">
          <h2>Lectures</h2>
          <p class="small muted">Grouped automatically from file names and from which slides each ILO was matched to. Rename lectures, or move files and ILOs if anything is in the wrong place.</p>
          {sorted.map((l) => (
            <div key={l.id} class="ilo-row row" style={{ flexWrap: 'nowrap' }}>
              <span class="ilo-id" style={{ minWidth: '34px' }}>{l.number ? `L${l.number}` : '—'}</span>
              <input type="text" value={l.title} onInput={(e) => setLectures(lectures.map((x) => (x.id === l.id ? { ...x, title: e.currentTarget.value, userEdited: true } : x)))} />
            </div>
          ))}
          <button class="btn sm" style={{ marginTop: '8px' }} onClick={addLecture}>＋ Add a lecture</button>
        </div>

        <div class="card">
          <h2>Files</h2>
          {files.map((f) => (
            <div key={f.id} class="file-row">
              <span class="small">{f.name}</span>
              <select value={lectureOf('fileIds', f.id)} onChange={(e) => move('fileIds', f.id, e.currentTarget.value)}>
                <option value="">— none —</option>
                {sorted.map((l) => <option key={l.id} value={l.id}>{l.number ? `L${l.number} ` : ''}{l.title}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div class="card">
          <h2>ILOs</h2>
          {ilos.map((i) => (
            <div key={i.id} class="file-row">
              <span class="small"><b class="ilo-id">{i.id}</b> {i.text}</span>
              <select value={lectureOf('iloIds', i.id)} onChange={(e) => move('iloIds', i.id, e.currentTarget.value)}>
                <option value="">— none —</option>
                {sorted.map((l) => <option key={l.id} value={l.id}>{l.number ? `L${l.number} ` : ''}{l.title}</option>)}
              </select>
            </div>
          ))}
        </div>

        {saved && <div class="okbox small">{saved}</div>}
        <div class="row" style={{ marginTop: '12px' }}>
          <button class="btn primary" onClick={save}>Save changes</button>
          <button class="btn" onClick={() => go(`/m/${moduleId}`)}>Done</button>
          <button class="btn ghost" onClick={reset}>Regroup automatically</button>
        </div>
      </div>
    </div>
  );
}
