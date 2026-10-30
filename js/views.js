// Die einzelnen Seiten der App. Jede View liefert HTML und bindet danach ihre Events.
import { esc, langName, formatDate, norm, LANG_FOLDERS, LANGS, safeFileName } from './text.js';
import { stats, query, STATUS_FILTERS, SORTS, allCategories, allTags, languages, findOfficial } from './model.js';
import { entryHref, seriesHref, listHref, img, statusBadges, entries, bar, pct, options, chips } from './ui.js';
import { prefs, WORKFLOW_FILE, DEFAULT_SETTINGS } from './store.js';
import { parseNfc } from './nfc.js';

const PAGE_SIZE = 120;

function langChips(model, selected, hrefFor) {
  const langs = languages(model);
  return chips([['alle', 'Alle Sprachen'], ...langs.map((l) => [l, langName(l)])], selected, hrefFor);
}

function inLang(model, lang) {
  return [...model.entries.values()].filter((e) => lang === 'alle' || e.lang === lang);
}

// ---------------------------------------------------------------- Übersicht

export const overview = {
  render({ model, store, params }) {
    const lang = params.get('lang') || prefs.get().lang;
    const list = inLang(model, lang);
    const s = stats(list);
    const L = (p) => listHref({ lang, ...p });
    const status = store.state.catalog.status || {};

    const byCat = new Map();
    for (const e of list) {
      if (!byCat.has(e.category)) byCat.set(e.category, []);
      byCat.get(e.category).push(e);
    }
    const cats = [...byCat.entries()].map(([c, l]) => [c, stats(l)]).sort((a, b) => b[1].total - a[1].total);

    const series = [...model.series.values()].filter((x) => lang === 'alle' || x.lang === lang);
    const mostMissing = series.filter((x) => x.stats.missing).sort((a, b) => b.stats.missing - a.stats.missing || a.name.localeCompare(b.name)).slice(0, 10);
    const changes = store.state.catalog.changes.slice(0, 3);

    return `
      <div class="row"><h1>Übersicht</h1><span class="spacer"></span></div>
      ${langChips(model, lang, (l) => `#/?lang=${l}`)}
      <div class="stats">
        <a class="card stat" href="${L({ status: 'nfc' })}"><div class="value">${s.withNfc}</div><div class="label">von ${s.official} offiziellen Tonies mit NFC (${pct(s.coverage)})</div>${bar(s.withNfc, s.official)}</a>
        <a class="card stat" href="${L({ status: 'fehlt' })}"><div class="value">${s.missing}</div><div class="label">offizielle Tonies ohne NFC</div></a>
        <a class="card stat" href="${L({ status: 'offen' })}"><div class="value">${s.unassigned}</div><div class="label">NFC-Dateien ohne Zuordnung</div></a>
        <a class="card stat" href="${L({ status: 'besitz' })}"><div class="value">${s.owned}</div><div class="label">besitze ich${s.owned ? ` · davon ${list.filter((e) => e.owned && !e.hasNfc).length} ohne NFC` : ''}</div></a>
        <a class="card stat" href="${L({ status: 'wunsch' })}"><div class="value">${s.wish}</div><div class="label">auf der Wunschliste</div></a>
        <a class="card stat" href="${L({ status: 'neu', sort: 'hinzu' })}"><div class="value">${s.isNew}</div><div class="label">neu (letzte 3 Wochen)</div></a>
        <a class="card stat" href="#/serien?lang=${lang}"><div class="value">${series.length}</div><div class="label">Serien</div></a>
        <div class="card stat"><div class="value">${s.files}</div><div class="label">NFC-Dateien</div></div>
      </div>

      <div class="two-col">
        <section>
          <h2>Kategorien</h2>
          <div class="card">
            <table class="simple">
              <thead><tr><th>Kategorie</th><th class="num">NFC / offiziell</th><th style="width:35%">Abdeckung</th></tr></thead>
              <tbody>${cats
                .map(
                  ([c, cs]) => `<tr class="link" data-href="${L({ cat: c })}">
                    <td>${esc(c)}</td>
                    <td class="num">${cs.official ? `${cs.withNfc} / ${cs.official}` : `${cs.total} Dateien`}</td>
                    <td>${cs.official ? bar(cs.withNfc, cs.official) : ''}</td></tr>`,
                )
                .join('')}</tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>Serien mit den meisten Lücken</h2>
          <div class="card">
            ${
              mostMissing.length
                ? `<table class="simple"><tbody>${mostMissing
                    .map(
                      (x) => `<tr class="link" data-href="${seriesHref(x.key)}">
                        <td>${esc(x.name)} ${lang === 'alle' ? `<span class="muted small">${esc(langName(x.lang))}</span>` : ''}</td>
                        <td class="num">${x.stats.withNfc} / ${x.stats.official}</td>
                        <td style="width:30%">${bar(x.stats.withNfc, x.stats.official)}</td></tr>`,
                    )
                    .join('')}</tbody></table>`
                : '<div class="muted">Keine Lücken – alles vorhanden.</div>'
            }
            <p class="small"><a href="#/serien?lang=${lang}&sort=fehlend">Alle Serien nach Lücken sortiert →</a></p>
          </div>
        </section>
      </div>

      <div class="two-col">
        <section>
          <h2>Letzte Änderungen</h2>
          <div class="card">
            ${
              changes.length
                ? changes.map((c) => `<div><strong>${formatDate(c.date)}</strong>: +${c.added.length} / −${c.removed.length}</div>`).join('')
                : '<div class="muted">Noch keine Änderungen seit dem ersten Import.</div>'
            }
            <p class="small"><a href="#/aenderungen">Änderungsprotokoll →</a></p>
          </div>
        </section>
        <section>
          <h2>Quellen</h2>
          <div class="card small">
            <dl class="facts">
              ${Object.entries(status.sources || {})
                .map(([src, n]) => `<dt>${esc(src)}</dt><dd><a href="${listHref({ src, lang: 'alle' })}">${n} Dateien</a></dd>`)
                .join('')}
              ${
                status.upstream
                  ? `<dt>nortakales</dt><dd>Stand ${formatDate(status.upstream.commitDate)} · <code>${esc(status.upstream.commit?.slice(0, 7))}</code></dd>`
                  : ''
              }
              <dt>Katalog gebaut</dt><dd>${status.generatedAt ? new Date(status.generatedAt).toLocaleString('de-DE') : '–'}</dd>
              <dt>Referenz</dt><dd>${status.officialGroups ?? '–'} offizielle Tonies (tonies-json)</dd>
            </dl>
            ${(status.warnings || []).length ? `<div class="notice warn">${status.warnings.length} Warnung(en):<br>${status.warnings.map(esc).join('<br>')}</div>` : ''}
          </div>
        </section>
      </div>`;
  },
};

// ---------------------------------------------------------------- Serien

export const seriesList = {
  render({ model, params }) {
    const lang = params.get('lang') || prefs.get().lang;
    const q = params.get('q') || '';
    const sort = params.get('sort') || 'name';
    const filter = params.get('f') || 'alle';
    const tokens = norm(q).split(' ').filter(Boolean);
    let list = [...model.series.values()].filter((s) => lang === 'alle' || s.lang === lang);
    list = list.filter((s) => {
      if (filter === 'komplett' && !(s.stats.official && !s.stats.missing)) return false;
      if (filter === 'luecken' && !(s.stats.missing && s.stats.withNfc)) return false;
      if (filter === 'ohne' && !(s.stats.official && !s.stats.withNfc)) return false;
      if (filter === 'offen' && !s.stats.unassigned) return false;
      return !tokens.length || tokens.every((t) => norm(s.name).includes(t));
    });
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
      fehlend: (a, b) => b.stats.missing - a.stats.missing || a.name.localeCompare(b.name, 'de'),
      abdeckung: (a, b) => (b.stats.coverage ?? -1) - (a.stats.coverage ?? -1) || a.name.localeCompare(b.name, 'de'),
      groesse: (a, b) => b.stats.total - a.stats.total,
    }[sort];
    list.sort(cmp);
    const H = (p) => {
      const n = new URLSearchParams({ lang, q, sort, f: filter, ...p });
      return `#/serien?${n}`;
    };
    return `
      <h1>Serien</h1>
      ${langChips(model, lang, (l) => H({ lang: l }))}
      <div class="filters">
        <input type="search" id="series-q" placeholder="Serie suchen …" value="${esc(q)}">
        <select id="series-f">${options(
          [['alle', 'Alle'], ['komplett', 'Vollständig'], ['luecken', 'Mit Lücken'], ['ohne', 'Ganz ohne NFC'], ['offen', 'Mit offenen Zuordnungen']],
          filter,
        )}</select>
        <select id="series-sort">${options(
          [['name', 'A–Z'], ['fehlend', 'Meiste Lücken'], ['abdeckung', 'Abdeckung'], ['groesse', 'Größe']],
          sort,
        )}</select>
        <span class="muted small">${list.length} Serien</span>
      </div>
      <div class="series-list">
        ${list
          .map(
            (s) => `<a class="card series-card" href="${seriesHref(s.key)}">
              ${img(s.img)}
              <div>
                <div class="name">${esc(s.name)}</div>
                <div class="small muted">${s.stats.official ? `${s.stats.withNfc} / ${s.stats.official} mit NFC` : `${s.stats.files} NFC-Dateien`}${
                  lang === 'alle' ? ` · ${esc(langName(s.lang))}` : ''
                }${s.stats.unassigned ? ` · ${s.stats.unassigned} offen` : ''}${s.stats.owned ? ` · ${s.stats.owned} im Besitz` : ''}</div>
                ${s.stats.official ? bar(s.stats.withNfc, s.stats.official) : ''}
              </div>
            </a>`,
          )
          .join('')}
      </div>
      ${list.length ? '' : '<div class="empty">Keine Serien gefunden.</div>'}`;
  },
  bind(root, { params, navigate }) {
    const set = (k, v) => {
      const p = new URLSearchParams(params);
      p.set(k, v);
      navigate(`#/serien?${p}`, { replace: true });
    };
    let t;
    root.querySelector('#series-q').addEventListener('input', (ev) => {
      clearTimeout(t);
      t = setTimeout(() => set('q', ev.target.value), 200);
    });
    root.querySelector('#series-f').addEventListener('change', (ev) => set('f', ev.target.value));
    root.querySelector('#series-sort').addEventListener('change', (ev) => set('sort', ev.target.value));
  },
};

export const seriesDetail = {
  render({ model, parts, params }) {
    const s = model.series.get(parts[1]);
    if (!s) return '<div class="empty">Serie nicht gefunden.</div>';
    const f = params.get('status') || 'alle';
    const view = params.get('view') || prefs.get().view;
    const filtered = s.entries
      .filter((e) => (STATUS_FILTERS[f] || STATUS_FILTERS.alle).test(e))
      .sort((a, b) => (a.release || 9e12) - (b.release || 9e12) || a.title.localeCompare(b.title, 'de'));
    const H = (p) => `${seriesHref(s.key)}?${new URLSearchParams({ status: f, view, ...p })}`;
    const counts = Object.entries(STATUS_FILTERS)
      .map(([k, v]) => [k, v.label, s.entries.filter(v.test).length])
      .filter(([k, , n]) => k === 'alle' || n);
    return `
      <div class="crumbs"><a href="#/serien?lang=${s.lang}">Serien</a> › ${esc(langName(s.lang))}</div>
      <div class="row"><h1>${esc(s.name)}</h1></div>
      <p class="muted">${s.stats.official} offizielle Tonies · ${s.stats.withNfc} mit NFC · ${s.stats.missing} fehlen · ${s.stats.files} NFC-Dateien${
        s.stats.unassigned ? ` · ${s.stats.unassigned} nicht zugeordnet` : ''
      } · ${s.categories.map(esc).join(', ')}</p>
      ${s.stats.official ? `<div style="max-width:420px;margin-bottom:12px">${bar(s.stats.withNfc, s.stats.official, s.stats.owned)}</div>` : ''}
      <div class="row">${chips(counts, f, (k) => H({ status: k }))}<span class="spacer"></span>
        <a class="btn" href="${H({ view: view === 'grid' ? 'list' : 'grid' })}">${view === 'grid' ? 'Listenansicht' : 'Kachelansicht'}</a>
        <a class="btn" href="${listHref({ series: s.key, lang: s.lang })}">In Liste filtern</a>
      </div>
      ${entries(filtered, view)}`;
  },
};

// ---------------------------------------------------------------- Liste / Suche

export const list = {
  render({ model, params, store }) {
    const p = Object.fromEntries(params);
    p.lang ||= params.has('q') ? 'alle' : prefs.get().lang;
    p.view ||= prefs.get().view;
    const results = query(model, p);
    const page = Math.max(1, Number(p.page) || 1);
    const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
    const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const base = query(model, { ...p, status: 'alle' });
    const statusChips = Object.entries(STATUS_FILTERS)
      .map(([k, v]) => [k, v.label, base.filter(v.test).length])
      .filter(([k, , n]) => k === 'alle' || n || k === p.status);
    const H = (patch) => listHref({ ...p, page: undefined, ...patch });
    const cats = allCategories(model);
    const tags = allTags(model, store.state.meta);
    const srcs = [...new Set(model.items.map((i) => i.src))];
    const seriesName = p.series ? model.series.get(p.series)?.name : null;
    const title = p.status && p.status !== 'alle' ? STATUS_FILTERS[p.status]?.label : 'Alle Tonies';
    return `
      <h1>${esc(title)}${seriesName ? ` · ${esc(seriesName)}` : ''}</h1>
      <div class="filters">
        <input type="search" id="list-q" placeholder="Titel, Serie, Tag, Notiz, UID …" value="${esc(p.q || '')}" autofocus>
        <select data-k="lang">${options([['alle', 'Alle Sprachen'], ...languages(model).map((l) => [l, langName(l)])], p.lang)}</select>
        <select data-k="cat">${options([['', 'Alle Kategorien'], ...cats.map((c) => [c, c])], p.cat)}</select>
        <select data-k="src">${options([['', 'Alle Quellen'], ...srcs.map((s) => [s, s])], p.src)}</select>
        ${tags.length ? `<select data-k="tag">${options([['', 'Alle Tags'], ...tags.map((t) => [t, `#${t}`])], p.tag)}</select>` : ''}
        <select data-k="age">${options([['', 'Jedes Alter'], ...[3, 4, 5, 6, 7, 8, 10, 12].map((a) => [a, `bis ${a} Jahre`])], p.age)}</select>
        <select data-k="sort">${options([['', 'Sortierung'], ...Object.entries(SORTS).map(([k, v]) => [k, v.label])], p.sort)}</select>
        <a class="btn" href="${H({ view: p.view === 'grid' ? 'list' : 'grid' })}" data-view="${p.view === 'grid' ? 'list' : 'grid'}">${
          p.view === 'grid' ? 'Listenansicht' : 'Kachelansicht'
        }</a>
        ${p.series ? `<a class="btn" href="${H({ series: '' })}">Serienfilter entfernen ✕</a>` : ''}
      </div>
      ${chips(statusChips, p.status || 'alle', (k) => H({ status: k }))}
      <p class="muted small">${results.length} Einträge${pages > 1 ? ` · Seite ${page} von ${pages}` : ''}</p>
      ${entries(shown, p.view)}
      ${
        pages > 1
          ? `<div class="pager">${page > 1 ? `<a class="btn" href="${listHref({ ...p, page: page - 1 })}">← zurück</a>` : ''}${
              page < pages ? `<a class="btn" href="${listHref({ ...p, page: page + 1 })}">weiter →</a>` : ''
            }</div>`
          : ''
      }`;
  },
  bind(root, { params, navigate }) {
    const set = (k, v) => {
      const p = new URLSearchParams(params);
      if (v) p.set(k, v);
      else p.delete(k);
      p.delete('page');
      navigate(`#/liste?${p}`, { replace: true });
    };
    let t;
    const q = root.querySelector('#list-q');
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => set('q', q.value), 200);
    });
    root.querySelectorAll('select[data-k]').forEach((s) => s.addEventListener('change', () => set(s.dataset.k, s.value)));
    root.querySelector('[data-view]')?.addEventListener('click', (ev) => prefs.set({ view: ev.currentTarget.dataset.view }));
  },
};

// ---------------------------------------------------------------- Detail

export const detail = {
  render({ model, parts, store }) {
    const e = model.entries.get(parts[1]);
    if (!e) {
      return `<div class="empty">Eintrag nicht gefunden.<br><span class="small">Vielleicht wurde er zugeordnet oder umbenannt.</span><br><a href="#/liste">Zur Liste</a></div>`;
    }
    const tags = allTags(model, store.state.meta);
    const cats = allCategories(model);
    const sug = e.suggest ? model.entries.get(e.suggest) : null;
    return `
      <div class="crumbs"><a href="#/serien?lang=${e.lang}">Serien</a> › <a href="${seriesHref(e.seriesKey)}">${esc(e.series)}</a></div>
      <div class="detail">
        <div>
          <div class="cover">${img(e.img)}</div>
          ${e.sample ? `<audio controls preload="none" src="${esc(e.sample)}" style="width:100%;margin-top:8px"></audio>` : ''}
        </div>
        <div>
          <div class="small muted"><a href="${seriesHref(e.seriesKey)}">${esc(e.series)}</a> · ${esc(langName(e.lang))}</div>
          <h1>${esc(e.title)}</h1>
          <div class="row" style="margin-bottom:12px">${statusBadges(e)}</div>
          <div class="row">
            <button class="toggle${e.owned ? ' on' : ''}" data-act="owned">${e.owned ? '✓ Besitze ich' : 'Besitze ich'}</button>
            <button class="toggle wish${e.wish ? ' on' : ''}" data-act="wish">${e.wish ? '★ Auf Wunschliste' : '☆ Wunschliste'}</button>
            ${e.kind === 'official' ? `<a class="btn" href="#/hochladen?for=${encodeURIComponent(e.key)}">NFC-Datei hochladen</a>` : ''}
          </div>

          <dl class="facts">
            <dt>Kategorie</dt>
            <dd>
              <select id="cat">${options(
                [['', e.meta.cat ? 'Automatisch' : `${e.category} (automatisch)`], ...cats.filter((c) => c !== 'Ohne Kategorie').map((c) => [c, c]), ['__neu', '+ Neue Kategorie …']],
                e.meta.cat || '',
              )}</select>
            </dd>
            ${e.age != null ? `<dt>Alter</dt><dd>ab ${esc(e.age)} Jahren</dd>` : ''}
            ${e.runtime ? `<dt>Laufzeit</dt><dd>${esc(e.runtime)} Min.</dd>` : ''}
            ${e.release ? `<dt>Erschienen</dt><dd>${formatDate(e.release)}</dd>` : ''}
            ${e.arts.length ? `<dt>Artikel-Nr.</dt><dd>${e.arts.map((a) => `<code>${esc(a)}</code>`).join(' ')}</dd>` : ''}
            ${e.web ? `<dt>Link</dt><dd><a href="${esc(e.web)}" target="_blank" rel="noopener noreferrer">tonies.com ↗</a></dd>` : ''}
          </dl>

          <h3>Tags</h3>
          <div class="row" id="tags">
            ${e.tags.map((t) => `<span class="badge tag">#${esc(t)} <button class="chip" style="padding:0 6px" data-untag="${esc(t)}" aria-label="Tag entfernen">×</button></span>`).join('')}
            <input type="text" id="tag-input" list="tag-list" placeholder="Tag hinzufügen …" style="width:180px">
            <button id="tag-add" aria-label="Tag hinzufügen">+</button>
            <datalist id="tag-list">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
          </div>

          <h3 style="margin-top:16px">Notiz</h3>
          <textarea id="note" placeholder="z. B. Wo steht die Figur, wem gehört sie …">${esc(e.meta.note || '')}</textarea>

          <h2>NFC-Dateien (${e.nfc.length})</h2>
          ${e.nfc.length ? e.nfc.map((n) => nfcBlock(n, e)).join('') : `<div class="notice">Für diesen Tonie gibt es noch keine NFC-Datei. <a href="#/hochladen?for=${encodeURIComponent(e.key)}">Jetzt hochladen</a></div>`}

          ${
            e.kind === 'nfc'
              ? `<h2>Zuordnen</h2>
                 <p class="muted small">Diese Datei ist noch keinem offiziellen Tonie zugeordnet. Mit einer Zuordnung zählt sie für Abdeckung und Lücken.</p>
                 ${sug ? `<div class="suggestions"><div class="small muted">Vorschlag:</div>${suggestion(sug, e.nfc[0].id, true)}</div>` : ''}
                 ${assignSearch(e.nfc[0].id, `${e.series} ${e.title}`)}`
              : ''
          }
        </div>
      </div>`;
  },
  bind(root, { model, parts, store, navigate }) {
    const e = model.entries.get(parts[1]);
    if (!e) return;
    root.querySelector('[data-act="owned"]').addEventListener('click', () => store.setEntry(e.key, { owned: !e.owned }));
    root.querySelector('[data-act="wish"]').addEventListener('click', () => store.setEntry(e.key, { wish: !e.wish }));
    root.querySelector('#cat').addEventListener('change', (ev) => {
      let v = ev.target.value;
      if (v === '__neu') {
        v = (prompt('Name der neuen Kategorie:') || '').trim();
        if (!v) {
          ev.target.value = e.meta.cat || '';
          return;
        }
      }
      store.setEntry(e.key, { cat: v || undefined });
    });
    const tagInput = root.querySelector('#tag-input');
    const addTag = () => {
      const t = tagInput.value.trim().replace(/^#/, '');
      if (!t) return;
      if (!e.tags.includes(t)) store.setEntry(e.key, { tags: [...e.tags, t] });
      store.addTag(t);
      tagInput.value = '';
    };
    tagInput.addEventListener('keydown', (ev) => ev.key === 'Enter' && (ev.preventDefault(), addTag()));
    root.querySelector('#tag-add').addEventListener('click', addTag);
    root.querySelectorAll('[data-untag]').forEach((b) =>
      b.addEventListener('click', () => store.setEntry(e.key, { tags: e.tags.filter((t) => t !== b.dataset.untag) })),
    );
    const note = root.querySelector('#note');
    note.addEventListener('change', () => store.setEntry(e.key, { note: note.value.trim() || undefined }));
    bindNfcActions(root, { model, store, navigate, entry: e });
  },
};

function nfcBlock(n, e) {
  const matchInfo = n.manual
    ? 'manuell zugeordnet'
    : n.assigned
      ? `automatisch zugeordnet (Treffer ${Math.round((n.score || 0) * 100)} %)`
      : 'ohne Zuordnung';
  return `<div class="nfc-file">
    <div class="row"><strong>${esc(n.title)}</strong><span class="badge tag">${esc(n.src)}</span>${n.pending ? '<span class="badge info">wird verarbeitet</span>' : ''}${
      n.duplicate ? '<span class="badge warn" title="Gleiche UID in mehreren Dateien">doppelte UID</span>' : ''
    }${n.isNew ? '<span class="badge info">neu</span>' : ''}</div>
    <div class="small muted"><code>${esc(n.id)}</code></div>
    <div class="small">UID <code>${esc(n.uid || '–')}</code> · ${esc(n.type || '?')} · ${matchInfo}${n.first ? ` · seit ${formatDate(n.first)}` : ''}</div>
    <div class="row">
      ${n.pending ? '' : `<button data-download="${esc(n.id)}">⬇ Download .nfc</button>`}
      ${e.kind === 'official' ? `<button data-unassign="${esc(n.id)}">Zuordnung lösen</button>` : ''}
      ${n.manual ? `<button data-auto="${esc(n.id)}">Automatik wiederherstellen</button>` : ''}
      ${e.kind === 'official' ? `<button data-reassign="${esc(n.id)}">Anderem Tonie zuordnen …</button>` : ''}
    </div>
    ${e.kind === 'official' ? `<div class="reassign" data-for="${esc(n.id)}" hidden>${assignSearch(n.id, `${n.series} ${n.title}`)}</div>` : ''}
  </div>`;
}

function suggestion(o, itemId, primary = false) {
  return `<div class="suggestion">${img(o.img)}<div><div class="small muted">${esc(o.series)} · ${esc(langName(o.lang))}${
    o.hasNfc ? ' · hat schon NFC' : ''
  }</div><div>${esc(o.title)}</div></div>
    <button class="${primary ? 'primary' : ''}" data-assign="${esc(itemId)}" data-group="${esc(o.key)}">Zuordnen</button></div>`;
}

function assignSearch(itemId, text) {
  return `<div class="assign-search" data-item="${esc(itemId)}">
    <input type="search" class="assign-q" placeholder="Offiziellen Tonie suchen …" value="${esc(text)}" style="width:100%">
    <div class="suggestions assign-results"></div>
  </div>`;
}

function bindNfcActions(root, { model, store, navigate, entry }) {
  root.querySelectorAll('[data-download]').forEach((b) =>
    b.addEventListener('click', async () => {
      const item = entry.nfc.find((n) => n.id === b.dataset.download);
      b.disabled = true;
      try {
        await store.downloadNfc(item);
      } catch (err) {
        alert(`Download fehlgeschlagen: ${err.message}`);
      } finally {
        b.disabled = false;
      }
    }),
  );
  root.querySelectorAll('[data-unassign]').forEach((b) =>
    b.addEventListener('click', () => {
      store.assign(b.dataset.unassign, '');
      navigate(`#/t/${encodeURIComponent(b.dataset.unassign)}`);
    }),
  );
  root.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => store.assign(b.dataset.auto, null)));
  root.querySelectorAll('[data-reassign]').forEach((b) =>
    b.addEventListener('click', () => {
      const box = root.querySelector(`.reassign[data-for="${CSS.escape(b.dataset.reassign)}"]`);
      box.hidden = !box.hidden;
      box.querySelector('.assign-q')?.dispatchEvent(new Event('input'));
    }),
  );
  root.querySelectorAll('.assign-search').forEach((box) => {
    const q = box.querySelector('.assign-q');
    const out = box.querySelector('.assign-results');
    const run = () => {
      const res = findOfficial(model, q.value, { lang: entry.lang }).filter((o) => o.key !== entry.key);
      out.innerHTML = res.length ? res.map((o) => suggestion(o, box.dataset.item)).join('') : '<div class="muted small">Keine Treffer.</div>';
    };
    q.addEventListener('input', run);
    if (!box.closest('[hidden]')) run();
  });
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-assign]');
    if (!b) return;
    store.assign(b.dataset.assign, b.dataset.group);
    navigate(`#/t/${encodeURIComponent(b.dataset.group)}`);
  });
}

// ---------------------------------------------------------------- Upload

const uploads = []; // bleibt beim Neu-Rendern erhalten

export const upload = {
  render({ model, params }) {
    const target = params.get('for') ? model.entries.get(params.get('for')) : null;
    return `
      <h1>NFC-Dateien hochladen</h1>
      <p class="muted">Eigene <code>.nfc</code>-Dateien (Flipper Zero) landen im internen Repo unter <code>sources/eigene/Sprache/Serie/Titel.nfc</code>
      und werden beim nächsten Katalog-Build automatisch einsortiert (dauert ca. 1 Minute).</p>
      ${target ? `<div class="notice">Ziel: <strong>${esc(target.series)} – ${esc(target.title)}</strong> (${esc(langName(target.lang))})</div>` : ''}
      <label class="dropzone" id="drop">
        <input type="file" id="file" accept=".nfc" multiple hidden>
        <strong>Dateien hierher ziehen</strong> oder klicken zum Auswählen
      </label>
      <div id="upload-list" style="margin-top:16px;display:grid;gap:12px"></div>`;
  },
  bind(root, ctx) {
    const { model, params } = ctx;
    const target = params.get('for') ? model.entries.get(params.get('for')) : null;
    const listEl = root.querySelector('#upload-list');
    const draw = () => {
      listEl.innerHTML = uploads.map((u, i) => uploadCard(u, i, model)).join('');
      bindUploadCards(listEl, ctx, draw);
    };
    const add = async (files) => {
      for (const f of files) {
        const text = await f.text();
        const nfc = parseNfc(text);
        const base = f.name.replace(/\.nfc$/i, '');
        const pl = prefs.get().lang;
        const lang = pl === 'alle' ? 'de' : pl;
        const u = {
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
          nfc,
          lang: target?.lang || lang,
          series: target?.series || '',
          title: target?.title || base,
          assignTo: target?.kind === 'official' ? target.key : '',
          state: 'neu',
        };
        if (!target) {
          const best = findOfficial(model, base, { lang: u.lang, limit: 1 })[0];
          if (best && norm(best.title) === norm(base)) {
            u.series = best.series;
            u.title = best.title;
            u.assignTo = best.key;
          }
        }
        uploads.push(u);
      }
      draw();
    };
    const drop = root.querySelector('#drop');
    const input = root.querySelector('#file');
    input.addEventListener('change', () => add(input.files));
    drop.addEventListener('dragover', (ev) => (ev.preventDefault(), drop.classList.add('over')));
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (ev) => {
      ev.preventDefault();
      drop.classList.remove('over');
      add(ev.dataTransfer.files);
    });
    draw();
  },
};

function uploadPath(u) {
  const folder = LANG_FOLDERS[u.lang] || u.lang;
  return `eigene/${folder}/${safeFileName(u.series) || 'Ohne Serie'}/${safeFileName(u.title) || 'Ohne Titel'}.nfc`;
}

function uploadCard(u, i, model) {
  const dups = u.nfc.uid ? model.items.filter((it) => it.uid === u.nfc.uid) : [];
  const assigned = u.assignTo ? model.entries.get(u.assignTo) : null;
  const seriesNames = [...new Set([...model.series.values()].filter((s) => s.lang === u.lang).map((s) => s.name))].sort();
  const done = u.state === 'fertig';
  return `<div class="card upload-item" data-i="${i}">
    <div class="row"><strong>${esc(u.name)}</strong>
      ${u.nfc.valid ? '<span class="badge ok">gültige Flipper-NFC</span>' : '<span class="badge missing">keine gültige Flipper-NFC-Datei</span>'}
      ${u.nfc.uid ? `<span class="small muted">UID <code>${esc(u.nfc.uid)}</code> · ${esc(u.nfc.type || '?')}</span>` : ''}
      <span class="spacer"></span>${done ? '' : `<button data-remove="${i}">Entfernen</button>`}
    </div>
    ${
      dups.length
        ? `<div class="notice warn">Diese UID gibt es schon: ${dups
            .map((d) => `<a href="#/t/${encodeURIComponent(model.entries.has(d.id) ? d.id : d.match || d.id)}">${esc(d.series)} – ${esc(d.title)}</a> (${esc(d.src)})`)
            .join(', ')}</div>`
        : ''
    }
    ${
      done
        ? `<div class="notice">Hochgeladen nach <code>sources/${esc(u.path)}</code>. ${
            u.assignTo ? `<a href="#/t/${encodeURIComponent(u.assignTo)}">Zum Tonie →</a>` : `<a href="#/t/${encodeURIComponent(u.path)}">Zum Eintrag →</a>`
          }</div>`
        : `<div class="grid3">
            <label class="field"><span>Sprache</span><select data-f="lang">${options(Object.entries(LANGS), u.lang)}</select></label>
            <label class="field"><span>Serie</span><input type="text" data-f="series" list="series-${i}" value="${esc(u.series)}" placeholder="z. B. Benjamin Blümchen">
              <datalist id="series-${i}">${seriesNames.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
            <label class="field"><span>Titel</span><input type="text" data-f="title" value="${esc(u.title)}"></label>
          </div>
          <div>
            <div class="small"><strong>Zuordnung:</strong> ${
              assigned
                ? `${esc(assigned.series)} – ${esc(assigned.title)} <button data-clear="${i}">keine</button>`
                : '<span class="muted">keine (wird automatisch versucht)</span>'
            }</div>
            <div class="suggestions" data-sugg="${i}">${findOfficial(model, `${u.series} ${u.title}`, { lang: u.lang, limit: 4 })
              .filter((o) => o.key !== u.assignTo)
              .map(
                (o) => `<div class="suggestion">${img(o.img)}<div><div class="small muted">${esc(o.series)}${o.hasNfc ? ' · hat schon NFC' : ''}</div><div>${esc(o.title)}</div></div>
                  <button data-pick="${i}" data-group="${esc(o.key)}">Übernehmen</button></div>`,
              )
              .join('')}</div>
          </div>
          <div class="row"><span class="small muted">Ziel: <code>sources/${esc(uploadPath(u))}</code></span><span class="spacer"></span>
            ${u.error ? `<span class="badge missing">${esc(u.error)}</span>` : ''}
            <button class="primary" data-upload="${i}" ${u.nfc.valid && u.series && u.title && u.state !== 'lädt' ? '' : 'disabled'}>${u.state === 'lädt' ? 'Lädt …' : 'Hochladen'}</button>
          </div>`
    }
  </div>`;
}

function bindUploadCards(el, { model, store }, draw) {
  el.querySelectorAll('[data-f]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const u = uploads[inp.closest('[data-i]').dataset.i];
      u[inp.dataset.f] = inp.value.trim();
      // verzögert, da "change" auch beim Entfernen des Feldes (blur) während eines Neuzeichnens feuert
      queueMicrotask(draw);
    }),
  );
  el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => (uploads.splice(b.dataset.remove, 1), draw())));
  el.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => ((uploads[b.dataset.clear].assignTo = ''), draw())));
  el.querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      const u = uploads[b.dataset.pick];
      const o = model.entries.get(b.dataset.group);
      Object.assign(u, { assignTo: o.key, series: o.series, title: o.title, lang: o.lang });
      draw();
    }),
  );
  el.querySelectorAll('[data-upload]').forEach((b) =>
    b.addEventListener('click', async () => {
      const u = uploads[b.dataset.upload];
      u.state = 'lädt';
      u.error = null;
      draw();
      const path = uploadPath(u);
      try {
        await store.upload({
          path,
          bytes: u.bytes,
          assignTo: u.assignTo || null,
          item: {
            src: 'eigene',
            lang: u.lang,
            langFolder: LANG_FOLDERS[u.lang] || u.lang,
            series: path.split('/')[2],
            title: path.split('/').pop().replace(/\.nfc$/, ''),
            uid: u.nfc.uid,
            type: u.nfc.type,
          },
        });
        Object.assign(u, { state: 'fertig', path });
      } catch (err) {
        u.state = 'neu';
        u.error = err.message;
      }
      draw();
    }),
  );
}

// ---------------------------------------------------------------- Änderungen

export const changes = {
  render({ store, model }) {
    const list = store.state.catalog.changes;
    const link = (c) => {
      const key = model.entries.has(c.id) ? c.id : model.items.find((i) => i.id === c.id)?.match;
      return key && model.entries.has(key) ? `<a href="#/t/${encodeURIComponent(key)}">${esc(c.series)} – ${esc(c.title)}</a>` : `${esc(c.series)} – ${esc(c.title)}`;
    };
    return `<h1>Änderungsprotokoll</h1>
      <p class="muted">Was bei den Synchronisierungen dazugekommen oder weggefallen ist.</p>
      ${
        list.length
          ? list
              .map(
                (c) => `<div class="card" style="margin-bottom:12px"><h3>${formatDate(c.date)} · +${c.added.length} / −${c.removed.length}</h3>
                  ${c.added.length ? `<div class="small"><strong>Neu:</strong><br>${c.added.map((a) => `${link(a)} <span class="muted">(${esc(a.src)}, ${esc(langName(a.lang))})</span>`).join('<br>')}</div>` : ''}
                  ${c.removed.length ? `<div class="small" style="margin-top:8px"><strong>Entfernt:</strong><br>${c.removed.map((a) => `${esc(a.series)} – ${esc(a.title)} <span class="muted">(${esc(a.src)})</span>`).join('<br>')}</div>` : ''}
                </div>`,
              )
              .join('')
          : '<div class="empty">Noch keine Änderungen seit dem ersten Import.</div>'
      }`;
  },
};

// ---------------------------------------------------------------- Einstellungen

export const settings = {
  render({ store }) {
    const s = store.settings;
    const st = store.state;
    const tags = st.model ? allTags(st.model, st.meta) : [];
    return `
      <h1>Einstellungen</h1>
      <div class="two-col">
        <section class="card">
          <h2 style="margin-top:0">Verbindung zum internen Repo</h2>
          <p class="small muted">Diese Angaben werden nur in diesem Browser gespeichert (localStorage bzw. sessionStorage)
          und nur an <code>api.github.com</code> gesendet.</p>
          <form id="settings-form">
            <label class="field"><span>Owner</span><input type="text" name="owner" value="${esc(s.owner)}" required></label>
            <label class="field"><span>Repository</span><input type="text" name="repo" value="${esc(s.repo)}" required></label>
            <label class="field"><span>Branch</span><input type="text" name="branch" value="${esc(s.branch)}" required></label>
            <label class="field"><span>Token</span>
              <div class="row"><input type="password" name="token" value="${esc(s.token)}" placeholder="github_pat_…" style="flex:1" autocomplete="off">
              <button type="button" id="show-token">Zeigen</button></div></label>
            <label class="row small" style="margin-bottom:12px"><input type="checkbox" name="remember" ${s.remember ? 'checked' : ''}>
              Token auf diesem Gerät merken (sonst nur bis der Tab geschlossen wird)</label>
            <div class="row">
              <button class="primary" type="submit">Speichern &amp; verbinden</button>
              <button type="button" id="forget">Token löschen</button>
            </div>
            <div id="conn-result" style="margin-top:12px"></div>
          </form>
          <details class="small" style="margin-top:12px">
            <summary>Wie bekomme ich ein Token?</summary>
            <ol>
              <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Fine-grained Token anlegen ↗</a></li>
              <li>Repository access: <em>Only select repositories</em> → <code>${esc(s.repo || DEFAULT_SETTINGS.repo)}</code></li>
              <li>Permissions: <strong>Contents: Read and write</strong>, optional <strong>Actions: Read and write</strong> (für „Jetzt synchronisieren“)</li>
              <li>Token kopieren und oben einfügen.</li>
            </ol>
          </details>
        </section>
        <section>
          <div class="card">
            <h2 style="margin-top:0">Synchronisierung</h2>
            <p class="small muted">Das interne Repo holt täglich automatisch neue Dateien von <code>nortakales/flipper-zero-tonies</code>
            und den offiziellen Katalog. Eigene Uploads werden sofort einsortiert.</p>
            <div id="sync-status" class="small">${st.status === 'ready' ? 'Lade Status …' : '–'}</div>
            <div class="row" style="margin-top:8px">
              <button id="sync-now" ${st.status === 'ready' ? '' : 'disabled'}>Jetzt synchronisieren</button>
              <button id="reload" ${st.status === 'ready' || st.status === 'error' ? '' : 'disabled'}>Daten neu laden</button>
            </div>
          </div>
          <div class="card" style="margin-top:16px">
            <h2 style="margin-top:0">Deine Daten</h2>
            <p class="small muted">Besitz, Wunschliste, Tags, Notizen, Kategorien und Zuordnungen liegen in <code>data/meta.json</code> im internen Repo.</p>
            ${
              st.meta
                ? `<p class="small">${Object.keys(st.meta.entries).length} Einträge mit Angaben · ${Object.keys(st.meta.assign).length} manuelle Zuordnungen · ${tags.length} Tags</p>
                   ${tags.length ? `<div class="row">${tags.map((t) => `<a class="badge tag" href="${listHref({ tag: t, lang: 'alle' })}">#${esc(t)}</a>`).join('')}</div>` : ''}
                   <div class="row" style="margin-top:12px"><button id="export">meta.json herunterladen</button></div>`
                : '<p class="muted small">Noch nicht geladen.</p>'
            }
          </div>
        </section>
      </div>`;
  },
  bind(root, { store, navigate }) {
    const form = root.querySelector('#settings-form');
    const result = root.querySelector('#conn-result');
    root.querySelector('#show-token').addEventListener('click', (ev) => {
      const t = form.elements.token;
      t.type = t.type === 'password' ? 'text' : 'password';
      ev.target.textContent = t.type === 'password' ? 'Zeigen' : 'Verbergen';
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = form.elements;
      store.setSettings({
        owner: f.owner.value.trim(),
        repo: f.repo.value.trim(),
        branch: f.branch.value.trim() || 'main',
        token: f.token.value.trim(),
        remember: f.remember.checked,
      });
      result.innerHTML = '<span class="muted">Verbinde …</span>';
      try {
        const repo = await store.gh.getRepo();
        result.innerHTML = `<div class="notice">Verbunden mit <strong>${esc(repo.full_name)}</strong> (${repo.private ? 'privat' : 'öffentlich'}). Lade Daten …</div>`;
        await store.load();
        if (store.state.status === 'ready') navigate('#/');
        else result.innerHTML = `<div class="notice error">${esc(store.state.error?.message)}</div>`;
      } catch (e) {
        result.innerHTML = `<div class="notice error">${esc(e.message)}</div>`;
      }
    });
    root.querySelector('#forget').addEventListener('click', () => {
      store.setSettings({ token: '' });
      store.clear();
      navigate('#/einstellungen', { force: true });
    });
    root.querySelector('#reload')?.addEventListener('click', () => store.load());
    root.querySelector('#export')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(store.state.meta, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'meta.json';
      a.click();
    });
    const statusEl = root.querySelector('#sync-status');
    const showRun = async () => {
      if (store.state.status !== 'ready') return;
      const cs = store.state.catalog.status || {};
      const base = `Katalog gebaut: ${cs.generatedAt ? new Date(cs.generatedAt).toLocaleString('de-DE') : '–'}`;
      try {
        const run = await store.gh.latestRun(WORKFLOW_FILE);
        statusEl.innerHTML = `${esc(base)}<br>Letzter Lauf: ${
          run
            ? `<a href="${esc(run.html_url)}" target="_blank" rel="noopener noreferrer">${new Date(run.created_at).toLocaleString('de-DE')}</a> – ${esc(runLabel(run))}`
            : 'noch keiner'
        }`;
      } catch (e) {
        statusEl.innerHTML = `${esc(base)}<br><span class="muted">Workflow-Status nicht lesbar (${esc(e.status === 403 ? 'Token ohne Actions-Recht' : e.message)}).</span>`;
      }
    };
    showRun();
    root.querySelector('#sync-now')?.addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        await store.gh.dispatchWorkflow(WORKFLOW_FILE);
        statusEl.innerHTML = 'Synchronisierung gestartet. Dauert ca. 1–2 Minuten, danach „Daten neu laden“.';
        setTimeout(showRun, 5000);
      } catch (e) {
        statusEl.innerHTML = `<span class="badge missing">${esc(e.status === 403 ? 'Token braucht „Actions: Read and write“' : e.message)}</span>`;
      } finally {
        ev.target.disabled = false;
      }
    });
  },
};

function runLabel(run) {
  if (run.status !== 'completed') return 'läuft …';
  return { success: 'erfolgreich', failure: 'fehlgeschlagen', cancelled: 'abgebrochen' }[run.conclusion] || run.conclusion;
}
