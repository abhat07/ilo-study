/**
 * Demo mode: a sandbox with sample lectures and a fake AI, for trying every feature without real material.
 * It uses its own database on this device, never syncs, and costs nothing. No imports here, so anything can use it.
 */
const KEY = 'ilo.demo';

export function isDemo(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemo(on: boolean): void {
  if (on) localStorage.setItem(KEY, '1');
  else localStorage.removeItem(KEY);
  location.hash = '#/';
  location.reload();
}

export const DB_NAME = () => (isDemo() ? 'ilo-study-demo' : 'ilo-study');
