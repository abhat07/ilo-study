/** Per-lecture status for a module: used by the home card and the module's lecture list. */
import { byModule, db } from '../db';
import type { Lecture } from '../types';
import { buildLectures } from './lectures';
import { latestScores, lectureMinutes, lectureState, liveItems, paceFrom, type LectureState } from './progress';

export interface LectureRow {
  lecture: Lecture;
  st: LectureState;
  questions: number;
  correct: number;
  mins: { total: number; left: number; recap: number };
}

export async function lectureOverview(moduleId: string): Promise<LectureRow[]> {
  const mod = await (await db()).get('modules', moduleId);
  if (!mod || mod.iloStatus !== 'confirmed') return [];
  const lectures = await buildLectures(moduleId); // cheap and idempotent; keeps your edits
  const [sections, items, attempts] = await Promise.all([byModule('sections', moduleId), byModule('items', moduleId), byModule('attempts', moduleId)]);
  const map = new Map(items.map((i) => [i.id, i]));
  const latest = latestScores(attempts);
  const pace = paceFrom(attempts, map);
  return lectures
    .filter((l) => l.iloIds.length || l.fileIds.length)
    .map((lecture) => {
      const secs = sections.filter((s) => s.lectureId === lecture.id);
      const live = secs.flatMap((s) => liveItems(s, map));
      return {
        lecture,
        st: lectureState(lecture, secs, map, latest),
        questions: live.length,
        correct: live.filter((i) => (latest.get(i.id)?.score ?? -1) >= 0.7).length,
        mins: lectureMinutes(lecture, secs, map, latest, pace),
      };
    });
}

/** The lecture to work on next: the first unfinished one (in lecture order) that has ILOs. */
export function nextLecture(rows: LectureRow[]): LectureRow | undefined {
  return rows.find((r) => r.lecture.iloIds.length && !r.st.done && r.lecture.number > 0) ?? rows.find((r) => r.lecture.iloIds.length && !r.st.done);
}
