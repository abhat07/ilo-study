/**
 * Small device-only settings. Kept in localStorage so they can be read synchronously.
 * The API key is NEVER included in exports and never leaves the device except in the
 * request header sent to the model provider.
 */
const K = {
  apiKey: 'ilo.apiKey',
  cap: 'ilo.capGBP',
  notice: 'ilo.dataNoticeAcceptedAt',
  mock: 'ilo.mock',
  name: 'ilo.name',
  theme: 'ilo.theme',
};

export const THEMES = ['brass', 'clay', 'sage', 'tide', 'ember'] as const;
export type ThemeName = (typeof THEMES)[number];

export const settings = {
  getApiKey(): string {
    return localStorage.getItem(K.apiKey) ?? '';
  },
  setApiKey(key: string): void {
    localStorage.setItem(K.apiKey, key.trim());
  },
  removeApiKey(): void {
    localStorage.removeItem(K.apiKey);
  },
  getCap(): number | null {
    const v = localStorage.getItem(K.cap);
    return v === null ? null : Number(v);
  },
  setCap(gbp: number): void {
    localStorage.setItem(K.cap, String(Math.max(0, gbp)));
  },
  /** Optional first name for the greeting. Stored only on this device. */
  getName(): string {
    return localStorage.getItem(K.name) ?? '';
  },
  setName(name: string): void {
    localStorage.setItem(K.name, name.trim().slice(0, 40));
  },
  getTheme(): ThemeName {
    const t = localStorage.getItem(K.theme) as ThemeName | null;
    return t && (THEMES as readonly string[]).includes(t) ? t : 'brass';
  },
  setTheme(t: ThemeName): void {
    localStorage.setItem(K.theme, t);
    applyTheme();
  },
  noticeAccepted(): boolean {
    return !!localStorage.getItem(K.notice);
  },
  acceptNotice(): void {
    localStorage.setItem(K.notice, new Date().toISOString());
  },
  /** Development only: answers come from a local fake model so the app can be tested without an API key. */
  mock(): boolean {
    return import.meta.env.DEV && localStorage.getItem(K.mock) === '1';
  },
  /** Settings that are safe to include in a backup file (no API key). */
  exportable(): Record<string, string | null> {
    return { cap: localStorage.getItem(K.cap), notice: localStorage.getItem(K.notice), name: localStorage.getItem(K.name), theme: localStorage.getItem(K.theme) };
  },
  importExportable(v: Record<string, string | null>): void {
    if (v.cap != null) localStorage.setItem(K.cap, v.cap);
    if (v.notice != null) localStorage.setItem(K.notice, v.notice);
    if (v.name != null) localStorage.setItem(K.name, v.name);
    if (v.theme != null) localStorage.setItem(K.theme, v.theme);
  },
};

/** Apply the chosen palette to <html data-theme> and the browser UI colour. */
export function applyTheme(): void {
  const t = settings.getTheme();
  document.documentElement.dataset.theme = t;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0c0e12');
}

export function maskKey(key: string): string {
  if (!key) return '';
  return key.slice(0, 7) + '…' + key.slice(-4);
}
