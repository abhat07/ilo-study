/**
 * Whether the reef animates on this device. By default it follows the computer's "reduce motion" setting
 * (Windows: Settings → Accessibility → Visual effects → Animation effects), but you can override it here.
 * Stored per device (not synced), since it depends on the screen you are using.
 */
import { useState } from 'preact/hooks';

const KEY = 'ilo.reefMotion';

export const systemReducesMotion = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function reefMotion(): boolean {
  const v = localStorage.getItem(KEY);
  return v === 'on' ? true : v === 'off' ? false : !systemReducesMotion();
}

/** Puts `reef-motion` on <html>; the CSS lets the reef animate when it is there, whatever the system says. */
export function applyReefMotion(): void {
  const on = reefMotion();
  document.documentElement.classList.toggle('reef-motion', on);
  document.documentElement.classList.toggle('reef-still', !on);
}

export function MotionChip() {
  const [on, setOn] = useState(reefMotion);
  const toggle = (e: Event) => {
    e.stopPropagation();
    const next = !on;
    localStorage.setItem(KEY, next ? 'on' : 'off');
    applyReefMotion();
    setOn(next);
  };
  const why = systemReducesMotion() ? ' Your computer is set to reduce motion, so the reef starts still.' : '';
  return (
    <button class="rchip motion-chip" onClick={toggle} aria-pressed={on}
      title={(on ? 'Pause the reef.' : 'Let the fish swim.') + why}>
      {on ? '⏸' : '▶ Let them swim'}
    </button>
  );
}
