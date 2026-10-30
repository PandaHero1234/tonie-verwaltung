// Kleine, wiederverwendbare Bausteine für die Views.
import { esc, langName } from './text.js';

export const entryHref = (e) => `#/t/${encodeURIComponent(e.key)}`;
export const seriesHref = (key) => `#/serie/${encodeURIComponent(key)}`;

export function listHref(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && v !== 'alle') p.set(k, v);
  const s = p.toString();
  return `#/liste${s ? `?${s}` : ''}`;
}

export function img(src, cls = '') {
  return src
    ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="ph ${cls}" aria-hidden="true">🎧</span>`;
}

export function statusBadges(e, { compact = false } = {}) {
  const b = [];
  if (e.kind === 'nfc') b.push('<span class="badge warn" title="Keinem offiziellen Tonie zugeordnet">nicht zugeordnet</span>');
  else if (e.hasNfc) b.push(`<span class="badge ok" title="NFC-Datei vorhanden">NFC${e.nfc.length > 1 ? ` ×${e.nfc.length}` : ''}</span>`);
  else b.push('<span class="badge missing" title="Keine NFC-Datei">fehlt</span>');
  if (e.owned) b.push('<span class="badge info">besitze ich</span>');
  if (e.wish) b.push('<span class="badge warn">Wunsch</span>');
  if (e.isNew) b.push('<span class="badge info">neu</span>');
  if (!compact && e.sources.includes('eigene')) b.push('<span class="badge tag">eigene</span>');
  return b.join('');
}

export function tile(e) {
  return `<a class="tile${e.hasNfc ? '' : ' missing'}" href="${entryHref(e)}">
    <div class="img">${img(e.img)}</div>
    <div class="badges">${statusBadges(e, { compact: true })}</div>
    <div class="body">
      <div class="series">${esc(e.series)}</div>
      <div class="title">${esc(e.title)}</div>
    </div>
  </a>`;
}

export function row(e) {
  return `<a class="list-row" href="${entryHref(e)}">
    ${img(e.img)}
    <div><div class="small muted">${esc(e.series)} · ${esc(langName(e.lang))} · ${esc(e.category)}</div><div><strong>${esc(e.title)}</strong></div></div>
    <div class="meta">${statusBadges(e)}${e.tags.map((t) => `<span class="badge tag">#${esc(t)}</span>`).join('')}</div>
  </a>`;
}

export function entries(list, view = 'grid') {
  if (!list.length) return '<div class="empty">Keine Einträge gefunden.</div>';
  return view === 'list' ? `<div class="list">${list.map(row).join('')}</div>` : `<div class="grid">${list.map(tile).join('')}</div>`;
}

export function bar(withNfc, total, owned = 0) {
  const pct = total ? (withNfc / total) * 100 : 0;
  const pctOwned = total && owned ? Math.min(100 - pct, (owned / total) * 100) : 0;
  return `<div class="bar" title="${withNfc} von ${total}"><span style="width:${pct.toFixed(1)}%"></span>${
    pctOwned ? `<span class="owned" style="width:${pctOwned.toFixed(1)}%"></span>` : ''
  }</div>`;
}

export const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);

export function options(list, selected) {
  return list
    .map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');
}

export function chips(list, selected, hrefFor) {
  return `<div class="chips">${list
    .map(
      ([value, label, n]) =>
        `<a class="chip${String(value) === String(selected) ? ' active' : ''}" href="${hrefFor(value)}">${esc(label)}${
          n != null ? `<span class="n">${n}</span>` : ''
        }</a>`,
    )
    .join('')}</div>`;
}
