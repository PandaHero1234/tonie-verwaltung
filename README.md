# tonie-verwaltung

Web-App zum Verwalten einer Tonie-Sammlung (Flipper-Zero-`.nfc`-Dateien und offizieller Tonie-Katalog).

**Dieses Repo ist nur die Hülle.** Es enthält keine Daten. Beim ersten Öffnen trägst du unter
*Einstellungen* dein privates Daten-Repo (`tonie-verwaltung-intern`) und ein GitHub-Token ein.
Beides wird **nur im Browser** gespeichert (localStorage, oder auf Wunsch nur sessionStorage)
und ausschließlich an `api.github.com` geschickt.

## Was die App kann

- **Übersicht**: wie viele offizielle Tonies es gibt, wie viele davon eine NFC-Datei haben, was fehlt,
  was du besitzt; Abdeckung je Kategorie, Serien mit den meisten Lücken, Stand der Quellen
- **Serien**: alle Serien mit Abdeckungsbalken, filterbar (vollständig, mit Lücken, ganz ohne NFC),
  sortierbar nach Lücken oder Abdeckung
- **Alle Tonies / Suche**: Volltextsuche (Umlaute egal) über Titel, Serie, Tags, Notizen, Artikelnummer, UID;
  Filter nach Sprache, Status (NFC vorhanden, fehlt, nicht zugeordnet, Besitz, Wunschliste, neu,
  doppelte UID), Kategorie, Quelle, Tag, Alter; Kachel- oder Listenansicht
- **Detailseite**: Bild, Hörprobe, Alter, Laufzeit, Link zu tonies.com; *Besitze ich* / *Wunschliste*,
  eigene Kategorie, Tags, Notiz; NFC-Dateien herunterladen; Zuordnung zu einem offiziellen Tonie ändern
- **Hochladen**: eigene `.nfc`-Dateien prüfen (gültig? UID schon vorhanden?), Serie/Titel festlegen
  oder einen offiziellen Tonie übernehmen; die Datei landet unter `sources/eigene/…` und wird automatisch einsortiert
- **Einstellungen**: Verbindung, Synchronisierung manuell anstoßen, `meta.json` exportieren

## Datenfluss

```
nortakales/flipper-zero-tonies ─┐   (täglich, GitHub Action im internen Repo)
tonies-json (offiziell)  ───────┼─► tonie-verwaltung-intern ── catalog/*.json, data/meta.json
eigene Uploads (App)     ───────┘                │
                                                 ▼  GitHub-API + Token aus dem Browser
                                   tonie-verwaltung (diese App, GitHub Pages)
```

Details zu Aufbau, Sync und Zuordnung: README im internen Repo.

## Einrichten

1. **GitHub Pages** aktivieren: *Settings → Pages → Source: GitHub Actions*. Jeder Push auf `main`
   deployt die App (`.github/workflows/pages.yml`).
2. **Token** anlegen: <https://github.com/settings/personal-access-tokens/new>
   - Repository access: *Only select repositories* → `tonie-verwaltung-intern`
   - Permissions: **Contents: Read and write**, optional **Actions: Read and write** (für „Jetzt synchronisieren“)
3. App öffnen → *Einstellungen* → Owner, Repo, Branch (`main`) und Token eintragen → *Speichern & verbinden*.

## Lokal entwickeln

Keine Build-Schritte und keine Abhängigkeiten, nur ES-Module.

```bash
npm start   # http://localhost:8080
npm test
```
