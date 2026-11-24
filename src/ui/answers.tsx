/** Answer inputs for each item type. Each reports its current response string (or null if empty). */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../types';

/** Deterministic shuffle so an item always shows the same order (and the correct MCQ option isn't always first). */
export function seededOrder(n: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function McqInput({ item, value, onChange }: { item: Item; value: number | null; onChange: (i: number) => void }) {
  const order = seededOrder(item.options.length, item.id);
  return (
    <div role="radiogroup">
      {order.map((oi, k) => (
        <button
          key={oi}
          role="radio"
          aria-checked={value === oi}
          class={'opt' + (value === oi ? ' sel' : '')}
          onClick={() => onChange(oi)}
        >
          <span class="letter">{String.fromCharCode(65 + k)}</span>{item.options[oi]}
        </button>
      ))}
    </div>
  );
}

export function ClozeInput({ value, onChange, onEnter }: { value: string; onChange: (s: string) => void; onEnter: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <input
      ref={ref}
      type="text"
      autocomplete="off"
      autocapitalize="off"
      spellcheck={false}
      placeholder="Type the missing term"
      value={value}
      onInput={(e) => onChange(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
    />
  );
}

export function ShortInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <textarea
      placeholder="Answer in your own words (1–4 sentences)"
      value={value}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

export function initialOrder(item: Item): string[] {
  let idx = seededOrder(item.steps.length, item.id);
  if (idx.every((v, i) => v === i)) idx = [...idx.slice(1), idx[0]];
  return idx.map((i) => item.steps[i]);
}

/** Drag-to-order list (pointer drag on the handle, or the arrow buttons). */
export function OrderInput({ order, onChange, result }: { order: string[]; onChange: (o: string[]) => void; result?: string[] }) {
  const [drag, setDrag] = useState<{ idx: number; startY: number; dy: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const move = (i: number, j: number) => {
    if (j < 0 || j >= order.length) return;
    const a = [...order];
    const [x] = a.splice(i, 1);
    a.splice(j, 0, x);
    onChange(a);
  };
  const onDown = (e: PointerEvent, idx: number) => {
    if (result) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ idx, startY: e.clientY, dy: 0 });
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || !listRef.current) return;
    const dy = e.clientY - drag.startY;
    const els = [...listRef.current.children] as HTMLElement[];
    const h = els[drag.idx]?.offsetHeight ?? 48;
    const step = Math.round(dy / (h + 6));
    if (step !== 0) {
      const j = Math.max(0, Math.min(order.length - 1, drag.idx + step));
      if (j !== drag.idx) {
        move(drag.idx, j);
        setDrag({ idx: j, startY: e.clientY, dy: 0 });
        return;
      }
    }
    setDrag({ ...drag, dy });
  };
  return (
    <ol class="order-list" ref={listRef} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      {order.map((s, i) => {
        const state = result ? (result[i] === s ? ' right' : ' wrong') : '';
        return (
          <li
            key={s}
            class={'order-item' + (drag?.idx === i ? ' dragging' : '') + state}
            style={drag?.idx === i ? { transform: `translateY(${drag.dy}px)` } : undefined}
          >
            <span class="grip" onPointerDown={(e) => onDown(e as unknown as PointerEvent, i)} aria-hidden="true">⠿</span>
            <span class="txt">{i + 1}. {s}</span>
            {!result && (
              <>
                <button class="mv" aria-label={`Move "${s}" up`} onClick={() => move(i, i - 1)}>↑</button>
                <button class="mv" aria-label={`Move "${s}" down`} onClick={() => move(i, i + 1)}>↓</button>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
