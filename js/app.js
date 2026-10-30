// Einstieg: Router, Rendering und globale Bedienelemente.
import { Store } from './store.js';
import { esc } from './text.js';
import * as views from './views.js';

const store = new Store();
const app = document.getElementById('app');

const ROUTES = {
  '': { view: views.overview, nav: '' },
  serien: { view: views.seriesList, nav: 'serien' },
  serie: { view: views.seriesDetail, nav: 'serien' },
  liste: { view: views.list, nav: 'liste' },
  t: { view: views.detail, nav: 'liste' },
  hochladen: { view: views.upload, nav: 'hochladen', live: false },
  aenderungen: { view: views.changes, nav: '' },
  einstellungen: { view: views.settings, nav: 'einstellungen', live: false, noData: true },
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, params: new URLSearchParams(qs), route: ROUTES[parts[0] || ''] };
}

function navigate(hash, { replace = false, force = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else if (location.hash === hash && force) render();
  else location.hash = hash;
}

let lastKey = '';
let lastStatus = '';
let rendering = false;
function render(opts = {}) {
  // Ein Feld kann beim Entfernen (blur/change) erneut speichern und damit rendern lassen
  if (rendering) {
    queueMicrotask(() => render(opts));
    return;
  }
  rendering = true;
  try {
    renderNow(opts);
  } finally {
    rendering = false;
  }
}

function renderNow({ fromStore = false } = {}) {
  const { parts, params, route } = parseHash();
  if (!route) {
    app.innerHTML = '<div class="empty">Seite nicht gefunden. <a href="#/">Zur Übersicht</a></div>';
    return;
  }
  const st = store.state;
  // Formular-Seiten nur neu zeichnen, wenn sich der Ladezustand ändert
  if (fromStore && route.live === false && lastKey === location.hash && lastStatus === st.status) return;
  lastStatus = st.status;

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const fehlt = route.nav === 'liste' && params.get('status') === 'fehlt' && parts[0] === 'liste';
    a.classList.toggle('active', fehlt ? a.dataset.nav === 'fehlt' : a.dataset.nav === route.nav);
  });
  const gq = document.querySelector('#global-search input');
  if (parts[0] === 'liste' && document.activeElement !== gq) gq.value = params.get('q') || '';

  if (!route.noData && st.status !== 'ready') {
    app.innerHTML = statusScreen(st);
    app.querySelector('[data-retry]')?.addEventListener('click', () => store.load());
    lastKey = '';
    return;
  }

  // Fokus und Cursor erhalten, wenn dieselbe Seite neu gezeichnet wird
  const active = document.activeElement;
  const keepFocus = lastKey === location.hash && active?.id && app.contains(active)
    ? { id: active.id, start: active.selectionStart, end: active.selectionEnd }
    : null;
  const scroll = lastKey === location.hash ? window.scrollY : 0;

  const ctx = { store, model: st.model, parts, params, navigate };
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = route.view.render(ctx);
  app.replaceChildren(root);
  route.view.bind?.(root, ctx);

  if (keepFocus) {
    const el = document.getElementById(keepFocus.id);
    if (el) {
      el.focus();
      try {
        el.setSelectionRange(keepFocus.start, keepFocus.end);
      } catch {
        /* nicht jedes Feld unterstützt das */
      }
    }
  }
  if (lastKey !== location.hash && !keepFocus) window.scrollTo(0, 0);
  else window.scrollTo(0, scroll);
  lastKey = location.hash;
}

function statusScreen(st) {
  if (st.status === 'unconfigured') {
    return `<div class="card" style="max-width:640px;margin:40px auto">
      <h1>Willkommen 👋</h1>
      <p>Diese App ist nur die Hülle. Deine Tonie-Daten liegen in deinem <strong>privaten Repository</strong>.
      Verbinde es einmalig mit einem GitHub-Token – das Token wird nur in diesem Browser gespeichert.</p>
      <a class="btn primary" href="#/einstellungen">Zu den Einstellungen</a>
    </div>`;
  }
  if (st.status === 'error') {
    return `<div class="card" style="max-width:640px;margin:40px auto">
      <h1>Daten konnten nicht geladen werden</h1>
      <div class="notice error">${esc(st.error?.message || 'Unbekannter Fehler')}</div>
      <div class="row"><button class="primary" data-retry>Erneut versuchen</button><a class="btn" href="#/einstellungen">Einstellungen prüfen</a></div>
    </div>`;
  }
  return '<div class="spinner" aria-label="Lädt"></div><p class="muted" style="text-align:center">Lade Katalog aus dem internen Repo …</p>';
}

// Speicheranzeige für data/meta.json
const savebar = document.getElementById('savebar');
let savedTimer;
function updateSavebar() {
  const st = store.state;
  clearTimeout(savedTimer);
  if (st.metaError) {
    savebar.hidden = false;
    savebar.className = 'savebar error';
    savebar.innerHTML = `Speichern fehlgeschlagen: ${esc(st.metaError.message)} <button id="save-retry">Erneut</button>`;
    savebar.querySelector('#save-retry').onclick = () => store.saveMeta();
  } else if (st.metaDirty || store.saving) {
    savebar.hidden = false;
    savebar.className = 'savebar';
    savebar.textContent = 'Speichere …';
    st.wasSaving = true;
  } else if (st.wasSaving) {
    st.wasSaving = false;
    savebar.hidden = false;
    savebar.className = 'savebar';
    savebar.textContent = '✓ Gespeichert';
    savedTimer = setTimeout(() => (savebar.hidden = true), 1500);
  }
}

store.addEventListener('change', () => {
  render({ fromStore: true });
  updateSavebar();
});
window.addEventListener('hashchange', () => render());
window.addEventListener('beforeunload', (ev) => {
  if (store.state.metaDirty) ev.preventDefault();
});

// Globale Suche
document.getElementById('global-search').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = ev.target.elements.q.value.trim();
  navigate(`#/liste?${new URLSearchParams(q ? { q, lang: 'alle' } : {})}`);
});
let gsTimer;
document.querySelector('#global-search input').addEventListener('input', (ev) => {
  clearTimeout(gsTimer);
  gsTimer = setTimeout(() => {
    const q = ev.target.value.trim();
    const { parts, params } = parseHash();
    if (parts[0] === 'liste') {
      if (q) params.set('q', q);
      else params.delete('q');
      params.delete('page');
      navigate(`#/liste?${params}`, { replace: true });
    } else if (q.length >= 2) navigate(`#/liste?${new URLSearchParams({ q, lang: 'alle' })}`);
  }, 250);
});

// Mobiles Menü
const nav = document.getElementById('nav');
document.getElementById('menu-toggle').addEventListener('click', (ev) => {
  const open = nav.classList.toggle('open');
  ev.currentTarget.setAttribute('aria-expanded', String(open));
});
nav.addEventListener('click', () => nav.classList.remove('open'));

// Tabellenzeilen als Links
app.addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-href]');
  if (tr && !ev.target.closest('a,button')) navigate(tr.dataset.href);
});

// Kaputte Bilder durch Platzhalter ersetzen
document.addEventListener(
  'error',
  (ev) => {
    const el = ev.target;
    if (el.tagName === 'IMG') {
      const ph = document.createElement('span');
      ph.className = `ph ${el.className}`;
      ph.textContent = '🎧';
      el.replaceWith(ph);
    }
  },
  true,
);

render();
store.load();
