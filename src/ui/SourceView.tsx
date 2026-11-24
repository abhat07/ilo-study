import { useState } from 'preact/hooks';
import { db } from '../db';
import type { Item } from '../types';
import { renderStoredPdfPage } from '../ingest/extract';
import { Spinner, useLive, where } from './common';

/** Highlight the quoted evidence inside the passage text. */
export function Highlighted({ text, quote }: { text: string; quote: string }) {
  const i = text.toLowerCase().indexOf(quote.toLowerCase().trim());
  if (i < 0) return <span>{text}</span>;
  const q = quote.trim();
  return (
    <span>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </span>
  );
}

export function SourceView({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const chunk = useLive(async () => (await db()).get('chunks', item.source.chunkId), [item.id]);
  const file = useLive(async () => (chunk ? (await db()).get('files', chunk.fileId) : undefined), [chunk?.fileId]);
  const loc = chunk?.locator ?? item.source.locator;

  const showPage = async () => {
    if (!file?.blob || loc.kind !== 'page') return;
    setImgBusy(true);
    try {
      const c = await renderStoredPdfPage(file.blob, loc.page, 1000);
      setImg(c.toDataURL('image/png'));
    } finally {
      setImgBusy(false);
    }
  };

  return (
    <div class="source">
      <div class="small muted" style={{ marginBottom: 4 }}>
        From <b>{where(item.source.fileName, loc)}</b>
        {chunk?.status === 'removed' && <span class="tag bad"> removed from latest upload</span>}
      </div>
      <div>“<mark>{item.source.quote}</mark>”</div>
      <button class="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} the full {loc.kind === 'time' ? 'transcript passage' : loc.kind === 'page' ? 'page' : 'slide'}
      </button>
      {open && chunk && (
        <div>
          <div class="passage small"><Highlighted text={chunk.text} quote={item.source.quote} /></div>
          {file?.blob && loc.kind === 'page' && !img && (
            <button class="btn sm" style={{ marginTop: 6 }} onClick={showPage} disabled={imgBusy}>
              {imgBusy ? 'Rendering…' : 'Show original slide'}
            </button>
          )}
          {imgBusy && <Spinner />}
          {img && <img class="slide-img" src={img} alt={`Original ${where(item.source.fileName, loc)}`} />}
        </div>
      )}
    </div>
  );
}
