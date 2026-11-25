/**
 * Mastery estimate per ILO.
 *
 * Evidence, strongest first:
 *  - first attempts at questions the student has never seen (weight 1.0; transfer questions 1.5)
 *  - repeats of seen questions count only a little (weight 0.2): repetition is not mastery
 *  - self-marked answers count at 70% of their weight; answers given after using the help chat count half
 *  - disputed marks are left out
 * Then:
 *  - time since last success, using the forgetting curve (FSRS stability of the ILO's items)
 *  - calibration: confidently-wrong answers pull the estimate down
 *  - no successful transfer question yet => capped below "secure"
 */
import type { Attempt, Confidence, Item } from '../types';

export const CONF_PROB: Record<Confidence, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 0.95 };
export const CONF_LABEL: Record<Confidence, string> = { 1: 'Guessing', 2: 'Unsure', 3: 'Fairly sure', 4: 'Certain' };

export interface MasteryEstimate {
  value: number; // 0..1
  label: 'No evidence' | 'Not yet' | 'Shaky' | 'Getting there' | 'Secure';
  evidence: 'none' | 'little' | 'some' | 'solid';
  newCorrect: number;
  newTotal: number;
  repeatCorrect: number;
  repeatTotal: number;
  transferSuccess: boolean;
  daysSinceSuccess: number | null;
  retention: number;
  overconfidentWrong: number;
  highConfTotal: number;
  explanation: string[];
}

const DAY = 86_400_000;

export function estimateMastery(attempts: Attempt[], items: Map<string, Item>, now = Date.now()): MasteryEstimate {
  const graded = attempts.filter((a) => !a.disputed && !a.elaboration);
  let a = 1, b = 2; // sceptical prior: mean 1/3
  let newCorrect = 0, newTotal = 0, repeatCorrect = 0, repeatTotal = 0;
  let transferSuccess = false;
  let lastSuccess: number | null = null;
  let overconfidentWrong = 0, highConfTotal = 0;
  for (const at of graded) {
    let w = at.firstExposure ? (at.transfer ? 1.5 : 1) : 0.2;
    if (at.mark.by === 'self') w *= 0.7;
    if (at.hinted) w *= 0.5; // answered with help from the chat
    a += w * at.score;
    b += w * (1 - at.score);
    if (at.firstExposure) {
      newTotal++;
      if (at.score >= 0.7) newCorrect++;
    } else {
      repeatTotal++;
      if (at.score >= 0.7) repeatCorrect++;
    }
    if (at.score >= 0.7) {
      if (at.transfer && at.firstExposure) transferSuccess = true;
      lastSuccess = Math.max(lastSuccess ?? 0, at.at);
    }
    if (at.confidence >= 3) {
      highConfTotal++;
      if (at.score < 0.5) overconfidentWrong++;
    }
  }
  const accuracy = a / (a + b);

  // Forgetting: stability from the ILO's reviewed items (days), default 1 day.
  const stab = [...new Set(graded.map((g) => g.itemId))]
    .map((id) => items.get(id)?.card.stability ?? 0)
    .filter((s) => s > 0);
  const S = stab.length ? stab.reduce((x, y) => x + y, 0) / stab.length : 1;
  const daysSinceSuccess = lastSuccess === null ? null : (now - lastSuccess) / DAY;
  const retention = daysSinceSuccess === null ? 1 : Math.pow(1 + daysSinceSuccess / (9 * S), -1);

  const overRate = highConfTotal >= 3 ? overconfidentWrong / highConfTotal : 0;
  const calibration = 1 - 0.3 * overRate;

  let value = accuracy * retention * calibration;
  if (!transferSuccess) value = Math.min(value, 0.79);
  if (graded.length === 0) value = 0;

  const evidence = newTotal === 0 ? 'none' : newTotal <= 2 ? 'little' : newTotal <= 5 ? 'some' : 'solid';
  const label: MasteryEstimate['label'] =
    graded.length === 0 ? 'No evidence' : value < 0.3 ? 'Not yet' : value < 0.6 ? 'Shaky' : value < 0.8 ? 'Getting there' : 'Secure';

  const explanation: string[] = [];
  if (graded.length === 0) explanation.push('No questions answered on this outcome yet.');
  else {
    explanation.push(`${newCorrect} of ${newTotal} correct on questions you had never seen before.`);
    if (repeatTotal) explanation.push(`${repeatCorrect} of ${repeatTotal} correct on repeats (these count much less).`);
    if (daysSinceSuccess !== null)
      explanation.push(
        daysSinceSuccess < 1
          ? 'Last success: today.'
          : `Last success ${Math.round(daysSinceSuccess)} day${Math.round(daysSinceSuccess) === 1 ? '' : 's'} ago; estimated recall now ${Math.round(retention * 100)}%.`,
      );
    else explanation.push('No correct answer yet.');
    if (highConfTotal >= 3 && overRate > 0.2)
      explanation.push(`You were confident but wrong ${overconfidentWrong} of ${highConfTotal} times — a sign of overconfidence here.`);
    explanation.push(transferSuccess ? 'You have applied it to a new scenario successfully.' : 'Not yet shown on an apply-it-to-a-new-case question.');
  }
  return {
    value, label, evidence, newCorrect, newTotal, repeatCorrect, repeatTotal, transferSuccess,
    daysSinceSuccess, retention, overconfidentWrong, highConfTotal, explanation,
  };
}

/** Calibration across a set of attempts: mean stated confidence vs actual accuracy, and Brier score. */
export function calibration(attempts: Attempt[]): { n: number; meanConf: number; accuracy: number; brier: number } {
  const g = attempts.filter((a) => !a.disputed && !a.elaboration);
  if (!g.length) return { n: 0, meanConf: 0, accuracy: 0, brier: 0 };
  let c = 0, acc = 0, brier = 0;
  for (const a of g) {
    const p = CONF_PROB[a.confidence];
    const y = a.score >= 0.7 ? 1 : 0;
    c += p;
    acc += y;
    brier += (p - y) ** 2;
  }
  return { n: g.length, meanConf: c / g.length, accuracy: acc / g.length, brier: brier / g.length };
}
