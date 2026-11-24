/** Visual flair: module themes, mastery rings, confetti, streaks. Kept out of the question content itself. */
import { byModule } from '../db';
import type { Module, SessionRecord } from '../types';

export interface Theme {
  accent: string;
  accent2: string;
  emoji: string;
}

const THEMES: Record<string, Theme> = {
  AMB: { accent: '#f97316', accent2: '#fbbf24', emoji: '🧬' },
  GEN: { accent: '#ea580c', accent2: '#f43f5e', emoji: '🫛' },
  BIP: { accent: '#f59e0b', accent2: '#fde047', emoji: '💻' },
};
const FALLBACK: Theme[] = [
  { accent: '#fb923c', accent2: '#fdba74', emoji: '🔬' },
  { accent: '#dc2626', accent2: '#f97316', emoji: '🧪' },
  { accent: '#d97706', accent2: '#facc15', emoji: '🦠' },
];

export function themeFor(m: Pick<Module, 'short'>): Theme {
  if (THEMES[m.short]) return THEMES[m.short];
  let h = 0;
  for (const c of m.short) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export function themeStyle(t: Theme): Record<string, string> {
  return { '--accent': t.accent, '--accent-2': t.accent2 };
}

export function MasteryRing({ value, theme, size = 58 }: { value: number; theme: Theme; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const id = `rg-${theme.accent.slice(1)}`;
  return (
    <div class="ring" style={{ width: size, height: size }} aria-label={`Average mastery ${Math.round(value * 100)}%`}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color={theme.accent} />
            <stop offset="1" stop-color={theme.accent2} />
          </linearGradient>
        </defs>
        <circle class="track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          class="val"
          cx={size / 2}
          cy={size / 2}
          r={r}
          style={{ stroke: `url(#${id})` }}
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        />
      </svg>
      <b>{Math.round(value * 100)}%</b>
    </div>
  );
}

const COLOURS = ['#f97316', '#fb923c', '#fbbf24', '#fde047', '#ea580c', '#ffffff', '#fdba74'];

/** A short confetti burst from a point (or the centre-top of the screen). Respects reduced-motion via CSS. */
export function confetti(x = window.innerWidth / 2, y = window.innerHeight / 3, count = 36): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.createElement('div');
  host.className = 'confetti';
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist + 120}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.style.background = COLOURS[i % COLOURS.length];
    p.style.animationDelay = `${Math.random() * 80}ms`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    host.appendChild(p);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 1300);
}

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface StudyStats {
  streak: number;
  studiedToday: boolean;
  answeredToday: number;
  answeredWeek: number;
}

/** Days in a row with at least one answered question (today counts if done, otherwise the streak runs to yesterday). */
export function computeStats(sessions: SessionRecord[], now = Date.now()): StudyStats {
  const days = new Set<string>();
  let answeredToday = 0;
  let answeredWeek = 0;
  const today = dayKey(now);
  for (const s of sessions) {
    if (!s.attemptIds.length) continue;
    days.add(dayKey(s.startedAt));
    if (dayKey(s.startedAt) === today) answeredToday += s.attemptIds.length;
    if (now - s.startedAt < 7 * 86_400_000) answeredWeek += s.attemptIds.length;
  }
  const studiedToday = days.has(today);
  let streak = 0;
  const d = new Date(now);
  if (!studiedToday) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { streak, studiedToday, answeredToday, answeredWeek };
}

export async function allSessions(moduleIds: string[]): Promise<SessionRecord[]> {
  return (await Promise.all(moduleIds.map((id) => byModule('sessions', id)))).flat();
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const PRAISE = ['Nailed it', 'Spot on', 'Yes!', 'Exactly right', 'Brilliant', 'Correct'];
export function praise(seed: number): string {
  return PRAISE[seed % PRAISE.length];
}

/** Small pop-up message at the top of the screen (level-ups, badges, XP). */
export function toast(html: string, ms = 2600): void {
  let host = document.querySelector<HTMLDivElement>('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  host.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}
