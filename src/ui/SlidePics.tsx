import { useEffect, useState } from 'preact/hooks';
import { imagesForChunk } from '../ingest/slideImages';
import { ensureImageBlob } from '../sync/sync';

export interface Pic {
  id: string;
  url: string;
  w: number;
  h: number;
}

/**
 * Pictures from a PowerPoint slide passage, ready to show. Pictures not on this device yet are fetched
 * from the synced copy; any still on their way from another device are counted in `waiting`.
 */
export function useSlidePics(chunkId: string | undefined, max = 6): { pics: Pic[]; waiting: number; loading: boolean } {
  const [state, setState] = useState<{ pics: Pic[]; waiting: number; loading: boolean }>({ pics: [], waiting: 0, loading: !!chunkId });
  useEffect(() => {
    if (!chunkId) return setState({ pics: [], waiting: 0, loading: false });
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      const list = (await imagesForChunk(chunkId).catch(() => [])).slice(0, max);
      const pics: Pic[] = [];
      let waiting = 0;
      for (const im of list) {
        const blob = await ensureImageBlob(im).catch(() => null);
        if (!alive) return;
        if (!blob) { waiting++; continue; }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        pics.push({ id: im.id, url, w: im.w, h: im.h });
      }
      if (alive) setState({ pics, waiting, loading: false });
    })();
    return () => {
      alive = false;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [chunkId, max]);
  return state;
}

/** All of a slide's pictures, full width (feedback "Show the full slide"). */
export function SlidePictures({ chunkId, alt }: { chunkId: string; alt: string }) {
  const { pics, waiting } = useSlidePics(chunkId);
  if (!pics.length && !waiting) return null;
  return (
    <div class="slide-pics">
      {pics.map((p, i) => <img key={p.id} class="slide-img" src={p.url} width={p.w} height={p.h} alt={`${alt}, picture ${i + 1}`} loading="lazy" />)}
      {waiting > 0 && <p class="muted small">{waiting} picture{waiting > 1 ? 's' : ''} from this slide still syncing from your other device.</p>}
    </div>
  );
}
