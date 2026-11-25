/**
 * Animated visuals for lesson explanations (dual coding): the model picks a format and fills it only
 * with content from the verified points; these components draw it.
 *   process – steps appear in order with a pulse travelling along the arrows
 *   cycle   – stages around a ring with a rotating highlight
 *   compare – a side-by-side table
 *   parts   – components radiating from a hub
 */
import type { Visual as V } from '../types';

export function Visual({ v, active }: { v: V; active?: number }) {
  if (v.kind === 'none' || v.items.length < 2) return null;
  const on = active !== undefined && active >= 0 && active < v.items.length ? active : undefined;
  return (
    <figure class={`vis vis-${v.kind}` + (on !== undefined ? ' has-active' : '')} style={on !== undefined ? { '--on': on } : undefined}>
      {v.title && <figcaption>{v.title}</figcaption>}
      {v.kind === 'process' && <Process v={v} on={on} />}
      {v.kind === 'cycle' && <Cycle v={v} on={on} />}
      {v.kind === 'compare' && <Compare v={v} on={on} />}
      {v.kind === 'parts' && <Parts v={v} on={on} />}
    </figure>
  );
}

function Process({ v, on }: { v: V; on?: number }) {
  return (
    <ol class="proc">
      {v.items.map((it, i) => (
        <li key={i} class={on === i ? 'on' : ''} style={{ '--i': i }}>
          <span class="n">{i + 1}</span>
          <div>
            <b>{it.label}</b>
            {it.detail && <span>{it.detail}</span>}
          </div>
          {i < v.items.length - 1 && <i class="arrow" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function Cycle({ v, on }: { v: V; on?: number }) {
  const n = v.items.length;
  const R = 110, cx = 160, cy = 140;
  const pos = (k: number) => {
    const a = (k / n) * 2 * Math.PI - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  return (
    <div class="cyc">
      <svg viewBox="0 0 320 280" role="img" aria-label={v.items.map((i) => i.label).join(' → ')}>
        <circle cx={cx} cy={cy} r={R} class="ring" />
        <circle cx={cx} cy={cy} r={R} class="spin" />
        {v.items.map((it, k) => {
          const [x, y] = pos(k);
          return (
            <g key={k} class={'node' + (on === k ? ' on' : '')} style={{ '--i': k }}>
              <circle cx={x} cy={y} r={16} />
              <text x={x} y={y + 4} text-anchor="middle">{k + 1}</text>
            </g>
          );
        })}
      </svg>
      <ol class="cyc-legend">
        {v.items.map((it, k) => (
          <li key={k} class={on === k ? 'on' : ''} style={{ '--i': k }}><b>{it.label}</b>{it.detail && <span> — {it.detail}</span>}</li>
        ))}
      </ol>
    </div>
  );
}

function Compare({ v, on }: { v: V; on?: number }) {
  const cols = v.columns.length ? v.columns : ['', ''];
  return (
    <div class="cmp-wrap">
      <table class="cmp">
        <thead>
          <tr><th />{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {v.items.map((it, i) => {
            const cells = it.detail.split('|').map((s) => s.trim());
            return (
              <tr key={i} class={on === i ? 'on' : ''} style={{ '--i': i }}>
                <th>{it.label}</th>
                {cols.map((_, k) => <td key={k}>{cells[k] ?? ''}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Parts({ v, on }: { v: V; on?: number }) {
  return (
    <div class="parts">
      <div class="hub">{v.title || 'Components'}</div>
      <div class="spokes">
        {v.items.map((it, i) => (
          <div key={i} class={'spoke' + (on === i ? ' on' : '')} style={{ '--i': i }}>
            <b>{it.label}</b>
            {it.detail && <span>{it.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Progress ring used for lectures. */
export function Ring({ value, size = 64, stroke = 7, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div class={'pring' + (v >= 1 ? ' full' : '')} style={{ width: `${size}px`, height: `${size}px` }} aria-label={`${Math.round(v * 100)}% complete`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} class="track" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} class="val" stroke-width={stroke} stroke-dasharray={c} stroke-dashoffset={c * (1 - v)} />
      </svg>
      <b>{label ?? (v >= 1 ? '✓' : `${Math.round(v * 100)}%`)}</b>
    </div>
  );
}
