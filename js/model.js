// Führt Katalog (NFC-Dateien + offizielle Tonies) und deine Metadaten zu einem
// durchsuchbaren Modell zusammen. Reine Funktionen, ohne DOM und Netzwerk.
import { norm } from './text.js';

export const NEW_DAYS = 21;

/**
 * Ein Eintrag ist entweder ein offizieller Tonie (kind 'official', key = Gruppen-ID)
 * oder eine NFC-Datei ohne Zuordnung (kind 'nfc', key = Datei-ID).
 */
export function buildModel({ items = [], groups = [], meta = {}, pending = [], today = new Date() }) {
  const assign = meta.assign || {};
  const metaEntries = meta.entries || {};
  const known = new Set(items.map((i) => i.id));
  const allItems = [...items, ...pending.filter((p) => !known.has(p.id)).map((p) => ({ ...p, pending: true }))];

  const entries = new Map();
  for (const g of groups) {
    entries.set(g.id, {
      key: g.id,
      kind: 'official',
      lang: g.lang,
      series: g.s,
      title: g.e || g.s,
      category: g.c,
      age: g.age,
      runtime: g.rt,
      release: g.r,
      img: g.img,
      web: g.web,
      sample: g.smp,
      arts: g.arts || [],
      nfc: [],
    });
  }

  const newSince = new Date(today.getTime() - NEW_DAYS * 86400000).toISOString().slice(0, 10);
  const uidCount = new Map();
  for (const it of allItems) if (it.uid) uidCount.set(it.uid, (uidCount.get(it.uid) || 0) + 1);

  for (const it of allItems) {
    const override = Object.prototype.hasOwnProperty.call(assign, it.id) ? assign[it.id] : undefined;
    const groupId = override !== undefined ? override || null : it.match || null;
    const nfc = {
      ...it,
      assigned: groupId && entries.has(groupId) ? groupId : null,
      manual: override !== undefined,
      isNew: Boolean(it.pending || (it.first && it.first >= newSince)),
      duplicate: it.uid ? uidCount.get(it.uid) > 1 : false,
    };
    if (nfc.assigned) {
      entries.get(nfc.assigned).nfc.push(nfc);
    } else {
      entries.set(it.id, {
        key: it.id,
        kind: 'nfc',
        lang: it.lang,
        series: it.series,
        title: it.sub ? `${it.sub} – ${it.title}` : it.title,
        category: null,
        suggest: it.suggest && entries.get(it.suggest)?.kind === 'official' ? it.suggest : null,
        arts: [],
        nfc: [nfc],
      });
    }
  }

  for (const e of entries.values()) {
    const m = metaEntries[e.key] || {};
    e.meta = m;
    e.category = m.cat || e.category || 'Ohne Kategorie';
    e.tags = m.tags || [];
    e.owned = Boolean(m.owned);
    e.wish = Boolean(m.wish);
    e.hasNfc = e.nfc.length > 0;
    e.isNew = e.nfc.some((n) => n.isNew);
    e.sources = [...new Set(e.nfc.map((n) => n.src))];
    e.seriesKey = `${e.lang}|${norm(e.series)}`;
    e.search = norm(
      [e.series, e.title, e.category, ...e.tags, m.note, ...e.arts, ...e.nfc.flatMap((n) => [n.title, n.series, n.uid])].join(' '),
    );
  }

  const series = buildSeries(entries);
  return { entries, series, items: allItems };
}

function buildSeries(entries) {
  const map = new Map();
  for (const e of entries.values()) {
    let s = map.get(e.seriesKey);
    if (!s) {
      s = { key: e.seriesKey, lang: e.lang, name: e.series, entries: [], hasOfficialName: false };
      map.set(e.seriesKey, s);
    }
    // offizielle Schreibweise (mit Umlauten) bevorzugen
    if (e.kind === 'official' && !s.hasOfficialName) {
      s.name = e.series;
      s.hasOfficialName = true;
    }
    s.entries.push(e);
  }
  for (const s of map.values()) {
    s.stats = stats(s.entries);
    s.img = s.entries.find((e) => e.img)?.img || null;
    s.categories = [...new Set(s.entries.map((e) => e.category))];
  }
  return map;
}

export function stats(list) {
  const r = { total: 0, official: 0, withNfc: 0, missing: 0, unassigned: 0, owned: 0, wish: 0, files: 0, isNew: 0 };
  for (const e of list) {
    r.total++;
    r.files += e.nfc.length;
    if (e.kind === 'official') {
      r.official++;
      if (e.hasNfc) r.withNfc++;
      else r.missing++;
    } else r.unassigned++;
    if (e.owned) r.owned++;
    if (e.wish) r.wish++;
    if (e.isNew) r.isNew++;
  }
  r.coverage = r.official ? r.withNfc / r.official : null;
  return r;
}

export const STATUS_FILTERS = {
  alle: { label: 'Alle', test: () => true },
  nfc: { label: 'NFC vorhanden', test: (e) => e.hasNfc },
  fehlt: { label: 'NFC fehlt', test: (e) => !e.hasNfc },
  offen: { label: 'Nicht zugeordnet', test: (e) => e.kind === 'nfc' },
  besitz: { label: 'Besitze ich', test: (e) => e.owned },
  besitzOhneNfc: { label: 'Besitze ich, ohne NFC', test: (e) => e.owned && !e.hasNfc },
  wunsch: { label: 'Wunschliste', test: (e) => e.wish },
  neu: { label: 'Neu', test: (e) => e.isNew },
  doppelt: { label: 'Doppelte UID', test: (e) => e.nfc.some((n) => n.duplicate) || e.nfc.length > 1 },
};

export const SORTS = {
  serie: { label: 'Serie', cmp: (a, b) => a.series.localeCompare(b.series, 'de') || a.title.localeCompare(b.title, 'de') },
  titel: { label: 'Titel', cmp: (a, b) => a.title.localeCompare(b.title, 'de') },
  erschienen: { label: 'Erscheinung (neueste)', cmp: (a, b) => (b.release || 0) - (a.release || 0) },
  hinzu: {
    label: 'Zuletzt hinzugefügt',
    cmp: (a, b) => latestFirst(b).localeCompare(latestFirst(a)),
  },
};
const latestFirst = (e) => e.nfc.reduce((m, n) => (n.pending ? '9999' : n.first && n.first > m ? n.first : m), '');

/** Filtert und sortiert Einträge. f: {q, lang, status, cat, src, tag, age, sort} */
export function query(model, f = {}) {
  const tokens = norm(f.q).split(' ').filter(Boolean);
  const status = STATUS_FILTERS[f.status] || STATUS_FILTERS.alle;
  const age = f.age ? Number(f.age) : null;
  const out = [];
  for (const e of model.entries.values()) {
    if (f.lang && f.lang !== 'alle' && e.lang !== f.lang) continue;
    if (!status.test(e)) continue;
    if (f.cat && e.category !== f.cat) continue;
    if (f.src && !e.sources.includes(f.src)) continue;
    if (f.tag && !e.tags.includes(f.tag)) continue;
    if (f.series && e.seriesKey !== f.series) continue;
    if (age != null && (e.age == null || e.age > age)) continue;
    if (tokens.length && !tokens.every((t) => e.search.includes(t))) continue;
    out.push(e);
  }
  const sort = SORTS[f.sort] || SORTS.serie;
  if (tokens.length && !f.sort) {
    // Relevanz: Treffer im Titel/Serienanfang zuerst
    const rank = (e) => {
      const t = norm(e.title);
      const s = norm(e.series);
      const q = tokens.join(' ');
      return t.startsWith(q) ? 0 : s.startsWith(q) ? 1 : t.includes(q) ? 2 : s.includes(q) ? 3 : 4;
    };
    out.sort((a, b) => rank(a) - rank(b) || SORTS.serie.cmp(a, b));
  } else out.sort(sort.cmp);
  return out;
}

/** Sucht offizielle Tonies passend zu einem Text (für Zuordnung und Upload). */
export function findOfficial(model, text, { lang, limit = 8 } = {}) {
  const tokens = new Set(norm(text).split(' ').filter((t) => t.length > 1));
  if (!tokens.size) return [];
  const res = [];
  for (const e of model.entries.values()) {
    if (e.kind !== 'official') continue;
    if (lang && e.lang !== lang) continue;
    const words = new Set(norm(`${e.series} ${e.title}`).split(' '));
    let hit = 0;
    for (const t of tokens) if (words.has(t) || [...words].some((w) => w.startsWith(t))) hit++;
    if (!hit) continue;
    res.push({ e, score: (2 * hit) / (tokens.size + words.size) });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, limit).map((r) => r.e);
}

export function allCategories(model) {
  return [...new Set([...model.entries.values()].map((e) => e.category))].sort((a, b) => a.localeCompare(b, 'de'));
}

export function allTags(model, meta) {
  const s = new Set(meta?.tags || []);
  for (const e of model.entries.values()) for (const t of e.tags) s.add(t);
  return [...s].sort((a, b) => a.localeCompare(b, 'de'));
}

export function languages(model) {
  const c = new Map();
  for (const e of model.entries.values()) c.set(e.lang, (c.get(e.lang) || 0) + (e.hasNfc ? 1 : 0));
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
}
