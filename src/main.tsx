import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { ensureModules } from './db';
import { Home } from './ui/Home';
import { Settings } from './ui/Settings';
import { Upload } from './ui/Upload';
import { IloConfirm } from './ui/IloConfirm';
import { Session } from './ui/Session';
import { ModulePage } from './ui/ModulePage';
import { Learn } from './ui/Learn';
import { LectureEdit } from './ui/LectureEdit';
import { ReefPage } from './ui/ReefPage';
import { PlanPage } from './ui/PlanPage';
import { checkBatches } from './learn/batch';
import { toast } from './ui/fun';
import { topUpPool } from './engine/generate';
import { mapModule, scrubRemovedFiles } from './ingest/pipeline';
import { applyTheme } from './settings';
import { applyReefMotion } from './ui/motion';
import { startAutoSync } from './sync/sync';
import { DemoBanner, DemoGate } from './ui/Demo';
import { isDemo } from './mode';

applyTheme();
void scrubRemovedFiles().finally(startAutoSync);

// Installed apps keep a cached copy. Check for a new version when the app is opened, every time it comes back
// to the foreground, and every 30 minutes; with autoUpdate the page reloads itself once the new version is ready.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => reg.update().catch(() => {});
    setInterval(check, 30 * 60_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  },
});

// Night palette 21:00–06:00: less short-wavelength (blue) light and lower luminance in the evening.
function setTimeOfDay(): void {
  const h = new Date().getHours();
  document.documentElement.dataset.time = h >= 21 || h < 6 ? 'night' : 'day';
}
setTimeOfDay();
setInterval(setTimeOfDay, 5 * 60_000);
document.body.dataset.stage = 'home';
if (isDemo()) document.body.classList.add('demo');
// New reef creatures from finished lectures (announced wherever you are)
addEventListener('reef-news', (e) => ((e as CustomEvent<string[]>).detail ?? []).forEach((m, i) => setTimeout(() => toast(m, 3200), 400 + i * 900)));
// Lessons written ahead in a half-price batch: collect them when ready (on open, then every 2 minutes).
const collectBatches = () => void checkBatches().then((news) => news.length && dispatchEvent(new CustomEvent('reef-news', { detail: news }))).catch(console.warn);
setTimeout(collectBatches, 4000);
setInterval(collectBatches, 2 * 60_000);
// Ask the browser not to evict our data under storage pressure.
navigator.storage?.persist?.();

function useRoute(): string {
  const [r, setR] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setR(location.hash.slice(1) || '/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

function Screen() {
  const route = useRoute();
  useEffect(() => {
    // Warm the question pool for every confirmed module so a session can start instantly.
    // Passages matched offline (no key at the time) are re-matched with AI first.
    ensureModules().then((mods) =>
      mods
        .filter((m) => m.iloStatus === 'confirmed')
        .forEach((m) => mapModule(m.id, () => {}).catch(console.warn).finally(() => topUpPool(m.id, 2))),
    );
  }, []);
  const parts = route.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'settings') return <Settings />;
  if (parts[0] === 'reef') return <ReefPage />;
  if (parts[0] === 'plan') return <PlanPage />;
  if (parts[0] === 'm' && parts[1]) {
    const id = parts[1];
    if (parts[2] === 'upload') return <Upload key={id} moduleId={id} />;
    if (parts[2] === 'ilos') return <IloConfirm key={id} moduleId={id} />;
    if (parts[2] === 'study') return <Session key={route} moduleId={id} />;
    if (parts[2] === 'lectures') return <LectureEdit key={id} moduleId={id} />;
    if (parts[2] === 'l' && parts[3]) {
      if (parts[4] === 'recap') return <Session key={route} moduleId={id} lectureId={parts[3]} />;
      return <Learn key={route} moduleId={id} lectureId={parts[3]} />;
    }
    return <ModulePage key={id} moduleId={id} />;
  }
  return <Home />;
}

function App() {
  return (
    <>
      <DemoBanner />
      <DemoGate>
        <Screen />
      </DemoGate>
    </>
  );
}

applyReefMotion();
render(<App />, document.getElementById('app')!);
