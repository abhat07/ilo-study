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
import { topUpPool } from './engine/generate';
import { mapModule } from './ingest/pipeline';

registerSW({ immediate: true });

// Night palette 21:00–06:00: less short-wavelength (blue) light and lower luminance in the evening.
function setTimeOfDay(): void {
  const h = new Date().getHours();
  document.documentElement.dataset.time = h >= 21 || h < 6 ? 'night' : 'day';
}
setTimeOfDay();
setInterval(setTimeOfDay, 5 * 60_000);
document.body.dataset.stage = 'home';
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

function App() {
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
  if (parts[0] === 'm' && parts[1]) {
    const id = parts[1];
    if (parts[2] === 'upload') return <Upload key={id} moduleId={id} />;
    if (parts[2] === 'ilos') return <IloConfirm key={id} moduleId={id} />;
    if (parts[2] === 'study') return <Session key={route} moduleId={id} />;
    return <ModulePage key={id} moduleId={id} />;
  }
  return <Home />;
}

render(<App />, document.getElementById('app')!);
