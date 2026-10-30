// Einstellungen (nur im Browser), Laden der Daten aus dem internen Repo und Schreiben
// von Metadaten/Uploads zurück dorthin.
import { GitHub, b64encodeText, b64encodeBytes } from './github.js';
import { buildModel } from './model.js';

const SETTINGS_KEY = 'tonie.settings';
const PENDING_KEY = 'tonie.pending';
const PREFS_KEY = 'tonie.prefs';
export const WORKFLOW_FILE = 'sync.yml';
export const DEFAULT_SETTINGS = { owner: 'PandaHero1234', repo: 'tonie-verwaltung-intern', branch: 'main', token: '', remember: true };

function safeGet(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function safeSet(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function loadSettings() {
  const s = safeGet(sessionStorage, SETTINGS_KEY) || safeGet(localStorage, SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export function saveSettings(s) {
  // "Merken" = localStorage (bleibt), sonst nur sessionStorage (weg beim Schließen des Tabs)
  safeSet(localStorage, SETTINGS_KEY, null);
  safeSet(sessionStorage, SETTINGS_KEY, null);
  safeSet(s.remember ? localStorage : sessionStorage, SETTINGS_KEY, s);
}

export function clearSettings() {
  safeSet(localStorage, SETTINGS_KEY, null);
  safeSet(sessionStorage, SETTINGS_KEY, null);
  safeSet(localStorage, PENDING_KEY, null);
}

export const prefs = {
  get() {
    return { lang: 'de', view: 'grid', ...(safeGet(localStorage, PREFS_KEY) || {}) };
  },
  set(p) {
    safeSet(localStorage, PREFS_KEY, { ...prefs.get(), ...p });
  },
};

export const isConfigured = (s) => Boolean(s.owner && s.repo && s.token);

export class Store extends EventTarget {
  constructor() {
    super();
    this.settings = loadSettings();
    this.state = { status: 'idle', error: null, catalog: null, meta: null, model: null };
    this.metaSha = null;
    this.metaQueue = [];
    this.saveTimer = null;
    this.saving = false;
  }

  get gh() {
    return new GitHub(this.settings);
  }

  emit() {
    this.dispatchEvent(new Event('change'));
  }

  setSettings(s) {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
  }

  clear() {
    clearTimeout(this.saveTimer);
    this.metaQueue = [];
    this.state = { status: 'unconfigured', error: null, catalog: null, meta: null, model: null };
    this.emit();
  }

  async load() {
    if (!isConfigured(this.settings)) {
      this.state = { ...this.state, status: 'unconfigured' };
      this.emit();
      return;
    }
    this.state = { ...this.state, status: 'loading', error: null };
    this.emit();
    try {
      const gh = this.gh;
      const [items, official, changes, status, metaFile] = await Promise.all([
        gh.getJson('catalog/items.json'),
        gh.getJson('catalog/official.json'),
        gh.getJson('catalog/changes.json').catch(() => ({ entries: [] })),
        gh.getJson('catalog/status.json').catch(() => ({})),
        gh.getFile('data/meta.json'),
      ]);
      this.metaSha = metaFile.sha;
      const meta = normalizeMeta(metaFile.text ? JSON.parse(metaFile.text) : null);
      this.state = {
        status: 'ready',
        error: null,
        catalog: { items: items.items || [], groups: official.groups || [], changes: changes.entries || [], status },
        meta,
        loadedAt: new Date(),
      };
      this.prunePending();
      this.rebuild();
    } catch (e) {
      this.state = { ...this.state, status: 'error', error: e };
      this.emit();
    }
  }

  rebuild() {
    const { catalog, meta } = this.state;
    if (!catalog) return;
    this.state.model = buildModel({ items: catalog.items, groups: catalog.groups, meta, pending: this.pending() });
    this.emit();
  }

  // ---- Metadaten -------------------------------------------------------

  /** Ändert data/meta.json: fn(meta) mutiert; Speichern erfolgt gebündelt. */
  updateMeta(fn) {
    fn(this.state.meta);
    this.metaQueue.push(fn);
    this.state.metaDirty = true;
    this.rebuild();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveMeta(), 900);
  }

  async saveMeta(attempt = 0) {
    if (this.saving) {
      this.saveTimer = setTimeout(() => this.saveMeta(), 500);
      return;
    }
    if (!this.metaQueue.length) return;
    this.saving = true;
    const queued = this.metaQueue;
    this.metaQueue = [];
    try {
      const text = JSON.stringify(this.state.meta, null, 2) + '\n';
      const r = await this.gh.putFile('data/meta.json', b64encodeText(text), 'Tonie-Verwaltung: Metadaten aktualisiert', this.metaSha);
      this.metaSha = r.content.sha;
      this.state.metaDirty = this.metaQueue.length > 0;
      this.state.metaError = null;
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 3) {
        // Jemand anderes hat gespeichert: neu laden und eigene Änderungen erneut anwenden
        const f = await this.gh.getFile('data/meta.json');
        this.metaSha = f.sha;
        const fresh = normalizeMeta(f.text ? JSON.parse(f.text) : null);
        for (const fn of [...queued, ...this.metaQueue]) fn(fresh);
        this.state.meta = fresh;
        this.metaQueue = [...queued, ...this.metaQueue];
        this.saving = false;
        return await this.saveMeta(attempt + 1);
      }
      this.metaQueue = [...queued, ...this.metaQueue];
      this.state.metaError = e;
    } finally {
      this.saving = false;
      this.emit();
    }
  }

  entryMeta(meta, key) {
    meta.entries[key] ||= {};
    return meta.entries[key];
  }

  setEntry(key, patch) {
    this.updateMeta((meta) => {
      const m = this.entryMeta(meta, key);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)) delete m[k];
        else m[k] = v;
      }
      if (!Object.keys(m).length) delete meta.entries[key];
    });
  }

  /** Manuelle Zuordnung: groupId = ID eines offiziellen Tonies, '' = bewusst keiner, null = Automatik */
  assign(itemId, groupId) {
    this.updateMeta((meta) => {
      if (groupId === null) delete meta.assign[itemId];
      else meta.assign[itemId] = groupId;
    });
  }

  addTag(tag) {
    this.updateMeta((meta) => {
      if (!meta.tags.includes(tag)) meta.tags.push(tag);
      meta.tags.sort((a, b) => a.localeCompare(b, 'de'));
    });
  }

  // ---- Uploads ---------------------------------------------------------

  pending() {
    return safeGet(localStorage, PENDING_KEY) || [];
  }

  prunePending() {
    const known = new Set(this.state.catalog.items.map((i) => i.id));
    // nach 7 Tagen verwerfen, falls der Build nie lief
    const cutoff = Date.now() - 7 * 86400000;
    safeSet(localStorage, PENDING_KEY, this.pending().filter((p) => !known.has(p.id) && p.uploadedAt > cutoff));
  }

  async upload({ path, bytes, item, assignTo }) {
    const gh = this.gh;
    const repoPath = `sources/${path}`;
    const sha = await gh.fileSha(repoPath);
    if (sha) throw new Error(`Die Datei ${repoPath} existiert bereits.`);
    await gh.putFile(repoPath, b64encodeBytes(bytes), `Tonie-Verwaltung: ${path} hochgeladen`);
    safeSet(localStorage, PENDING_KEY, [...this.pending(), { ...item, id: path, uploadedAt: Date.now() }]);
    if (assignTo) this.assign(path, assignTo);
    else this.rebuild();
  }

  async downloadNfc(item) {
    const text = await this.gh.getText(`sources/${item.id}`);
    const blob = new Blob([text], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = item.id.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

export function normalizeMeta(m) {
  const meta = m && typeof m === 'object' ? m : {};
  return {
    version: 1,
    ...meta,
    entries: meta.entries || {},
    assign: meta.assign || {},
    tags: meta.tags || [],
  };
}
