// Text-Hilfen: Normalisierung für Suche/Vergleich und HTML-Escaping.

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const LANGS = {
  de: 'Deutsch', gsw: 'Schweizerdeutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch', da: 'Dänisch',
  sv: 'Schwedisch', nl: 'Niederländisch', pl: 'Polnisch', it: 'Italienisch', fi: 'Finnisch', pt: 'Portugiesisch',
};
export const LANG_FOLDERS = { de: 'German', gsw: 'Swiss German', en: 'English', fr: 'French', es: 'Spanish', da: 'Danish', sv: 'Swedish', nl: 'Dutch', pl: 'Polish', it: 'Italian' };
export const langName = (l) => LANGS[l] || l?.toUpperCase() || '?';

export function slug(s) {
  return norm(s).replace(/ /g, '-') || 'x';
}

export function formatDate(d) {
  if (!d) return '–';
  const date = typeof d === 'number' ? new Date(d * 1000) : new Date(d);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Dateinamen-taugliche Bezeichnung (wie in der Quelle: ASCII, Umlaute ausgeschrieben)
export function safeFileName(s) {
  return String(s ?? '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
