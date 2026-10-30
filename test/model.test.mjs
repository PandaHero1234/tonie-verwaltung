import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, query, stats, findOfficial } from '../js/model.js';
import { norm, safeFileName } from '../js/text.js';
import { parseNfc } from '../js/nfc.js';

const groups = [
  { id: 'de:1', lang: 'de', s: 'Benjamin Blümchen', e: 'Benjamin als Baggerfahrer', c: 'Hörspiel', age: 3 },
  { id: 'de:2', lang: 'de', s: 'Benjamin Blümchen', e: 'Benjamin als Weihnachtsmann', c: 'Hörspiel', age: 3 },
  { id: 'de:3', lang: 'de', s: 'Bibi & Tina', e: 'Das Waisenfohlen', c: 'Hörspiel', age: 6 },
];
const items = [
  { id: 'q/German/Benjamin Bluemchen/Benjamin als Baggerfahrer.nfc', src: 'q', lang: 'de', series: 'Benjamin Bluemchen', title: 'Benjamin als Baggerfahrer', uid: 'A', match: 'de:1', first: null },
  { id: 'q/German/Sonstwas/Unbekannt.nfc', src: 'q', lang: 'de', series: 'Sonstwas', title: 'Unbekannt', uid: 'B', suggest: 'de:3', first: '2026-10-29' },
];

test('Einträge aus offiziellen Tonies und nicht zugeordneten Dateien', () => {
  const m = buildModel({ items, groups, meta: {}, today: new Date('2026-10-30') });
  assert.equal(m.entries.size, 4);
  assert.equal(m.entries.get('de:1').nfc.length, 1);
  assert.equal(m.entries.get('de:2').hasNfc, false);
  const unassigned = m.entries.get(items[1].id);
  assert.equal(unassigned.kind, 'nfc');
  assert.equal(unassigned.suggest, 'de:3');
  assert.equal(unassigned.isNew, true);
  const s = stats([...m.entries.values()]);
  assert.deepEqual([s.official, s.withNfc, s.missing, s.unassigned], [3, 1, 2, 1]);
});

test('Serien werden über die normalisierte Schreibweise zusammengeführt', () => {
  const m = buildModel({ items, groups, meta: {} });
  const s = m.series.get(`de|${norm('Benjamin Blümchen')}`);
  assert.equal(s.name, 'Benjamin Blümchen');
  assert.equal(s.stats.official, 2);
  assert.equal(s.stats.withNfc, 1);
});

test('Manuelle Zuordnung und Metadaten aus meta.json', () => {
  const meta = {
    assign: { [items[1].id]: 'de:3', [items[0].id]: '' },
    entries: { 'de:3': { owned: true, tags: ['Pferde'], cat: 'Lieblinge' } },
  };
  const m = buildModel({ items, groups, meta });
  assert.equal(m.entries.get('de:3').nfc[0].manual, true);
  assert.equal(m.entries.get('de:1').hasNfc, false); // bewusst gelöst
  assert.equal(m.entries.get(items[0].id).kind, 'nfc');
  const e = m.entries.get('de:3');
  assert.equal(e.owned, true);
  assert.equal(e.category, 'Lieblinge');
  assert.deepEqual(query(m, { tag: 'Pferde' }).map((x) => x.key), ['de:3']);
});

test('Suche ignoriert Umlaute und filtert nach Status', () => {
  const m = buildModel({ items, groups, meta: {} });
  assert.equal(query(m, { q: 'bluemchen bagger' })[0].key, 'de:1');
  assert.equal(query(m, { q: 'Blümchen', status: 'fehlt' }).length, 1);
  assert.deepEqual(query(m, { status: 'offen' }).map((e) => e.kind), ['nfc']);
  assert.equal(query(m, { age: 4 }).length, 2);
});

test('Ausstehende Uploads erscheinen sofort', () => {
  const pending = [{ id: 'eigene/German/X/Y.nfc', src: 'eigene', lang: 'de', series: 'X', title: 'Y', uid: 'A' }];
  const m = buildModel({ items, groups, meta: { assign: { 'eigene/German/X/Y.nfc': 'de:2' } }, pending });
  const e = m.entries.get('de:2');
  assert.equal(e.hasNfc, true);
  assert.equal(e.nfc[0].pending, true);
  assert.equal(e.nfc[0].duplicate, true); // gleiche UID wie Baggerfahrer
});

test('findOfficial findet passende Tonies', () => {
  const m = buildModel({ items, groups, meta: {} });
  assert.equal(findOfficial(m, 'Waisenfohlen')[0].key, 'de:3');
});

test('Hilfsfunktionen', () => {
  assert.equal(safeFileName('Löwenzahn: Ein Dino?'), 'Loewenzahn Ein Dino');
  assert.equal(parseNfc('Filetype: Flipper NFC device\nUID: 01 02').uid, '01 02');
});
