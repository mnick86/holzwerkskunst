# CLS-Analyse und Optimierung

Stand: 16. November 2026. Ausgangscommit: `89784bf298fb2a3010af42ffe4677301ed0a3dec`.

Der im Auftrag genannte Lighthouse-Wert **0,101** ist ein externer Ausgangswert.
Hier wurden echte Layout-Shift-Einträge in lokalem Chrome gemessen, keine neuen
Lighthouse-Scores. Der produktive Lighthouse-Lauf wurde nicht reproduziert.
Die nachstehenden Werte dürfen deshalb nicht als dessen Vorher-/Nachher-Vergleich gelesen werden.

## Messung

`scripts/measure-cls.mjs` startet einen lokalen Static-Server und ein frisches Headless-Chrome-Profil.
Ein vor den Seitenskripten installierter `PerformanceObserver` zeichnet `layout-shift` mit
Zeitpunkten, `hadRecentInput`, verschobenen Knoten und deren alten/neuen Rechtecken auf.
CLS ist das größte Session-Fenster: weniger als eine Sekunde Abstand zwischen Shifts,
höchstens fünf Sekunden Gesamtdauer; Einträge mit `hadRecentInput` zählen nicht mit.
DOM-Mutationen und Bildladeereignisse werden zusätzlich protokolliert.

Gemessen mit Chrome **153.0.8010.36**, Node **24.15.0**, Windows:

| Profil  | Viewport / DPR | CPU-Verlangsamung | Netzwerklatenz | Download / Upload            |
| ------- | -------------- | ----------------- | -------------- | ---------------------------- |
| Mobil   | 390 × 844 / 1  | 4×                | 150 ms         | 200.000 / 93.750 Byte/s      |
| Desktop | 1440 × 900 / 1 | 1×                | 40 ms          | 1.250.000 / 1.250.000 Byte/s |

- Kalter Cache, Browsercache deaktiviert, keine Erweiterungen oder gespeicherten Sitzungen.
- Seiten: `/`, `/kategorie/Hochzeit.html`, `/produkt/holzscheiben/`.
- Zwei Ladebedingungen: normale gedrosselte Navigation (`cold`) sowie ein kontrolliertes
  Stressprofil (`late-assets`). Dort werden Bilder erst 700 ms und `site.js` erst 1400 ms
  **nach dem ersten Paint** freigegeben. CSS und Logos werden regulär geladen.
  So können schnelle lokale Ressourcen ein vorhandenes Problem nicht verdecken.
- Drei Wiederholungen je Seite, Gerät und Ladebedingung: **36 Vorher- und 36 Nachher-Läufe**.
- Erfasst wird die Navigation einschließlich einer Sekunde nach `load`. Keine Klicks oder
  Scrollaktionen im Messfenster. Das ist keine Messung über die gesamte Besuchsdauer.
- Zehn zusätzliche Vorher-Gegenproben: pro Gerät jeweils nur Sortierung, Galerie oder Teilen
  verborgen lassen beziehungsweise nur das Hero-Seitenverhältnis reservieren.

Die JSON-Rohdaten und Screenshots liegen lokal unter `tmp/cls-before*`, `tmp/cls-after*`
und `tmp/cls-accessibility*`; `tmp/` wird nicht veröffentlicht. Die kompakte Auswertung
einschließlich Einzelwerten und Gegenproben ist in [cls-messwerte.json](cls-messwerte.json) enthalten.

## Nachgewiesene Ursachen

### Hero-Bild

`src/hero.html.mustache` enthält korrekt `width="1672" height="941"`.
Allerdings überschreibt `.hero-visual img { aspect-ratio: auto; }` das daraus abgeleitete
vorläufige Seitenverhältnis. Vor dem Bildladen fehlt dadurch die reservierte Bildhöhe.

Im mobilen Stresslauf bewegt sich die Bildunterschrift um **201,375 px** nach unten;
die Kategorie-Leiste und der folgende Katalog werden mitverschoben. Diese gemeldeten
Elemente sind nicht die Ursache. Die Gegenprobe ändert ausschließlich das vorläufige
Hero-Seitenverhältnis: CLS fällt von **0,075212 auf 0,000000**. Das Unterdrücken der
Sortier-Einblendung lässt den mobilen Hero-Shift unverändert.

Am Desktop verschieben sich das zentrierte `figure.hero-visual` und seine Bildunterschrift.
Nur die Bildreservierung senkt den Startseiten-CLS von **0,024056 auf 0,000503**;
der verbleibende Anteil gehört dort zur Sortierung.

### Sortierung

`sortControl.hidden = false` blendet ein 44 px hohes Sortierfeld in eine zuvor nur
32 px hohe `.catalog-heading` ein. Der Katalog rückt um **12 px** nach unten;
die links zentrierte Überschrift verschiebt sich um **6 px**.

Auf der Kategorieseite senkt allein das Auslassen dieser Einblendung den CLS mobil
von **0,005187 auf 0,000000**, am Desktop von **0,003132 auf 0,000000**.
Auf der mobilen Startseite liegt der Katalog unter dem sichtbaren Bereich; derselbe
Layoutwechsel liefert dort keinen zusätzlichen CLS-Beitrag.

### Galerie und Teilen

`controls.hidden = false` fügt die **60 px** hohe Galerie-Steuerleiste nachträglich in den
normalen Fluss ein. Dadurch verschieben sich Vorschaubilder und mobil die Produktinformationen.
Die mobile Hinweismarke ändert zudem ihre Position anhand von `:has(...:not([hidden]))`.

Allein das Unterdrücken der Galerie-Einblendung senkt den Produktseiten-CLS mobil
von **0,033474 auf 0,000000**, am Desktop von **0,003898 auf 0,000223**.
Der Teilen-Button vergrößert separat die Zeile `.product-secondary` und beeinflusst
deren vertikal zentrierten E-Mail-Link. Ohne seine Einblendung misst derselbe Lauf
mobil **0,033417**, am Desktop **0,003327**. Die Anteile sind wegen gemeinsamer
betroffener Flächen nicht linear addierbar.

### SVGs, weitere Bilder und Animationen

Für Inline-SVGs wurde **kein eigener CLS-Beitrag nachgewiesen**. Die Kategorie-SVGs
haben bereits intrinsische 24 × 24 px. Dem allgemeinen Icon-Helper fehlen diese
Fallback-Abmessungen; er erhält sie vorsorglich. Die CSS-Größen bleiben maßgeblich.

Produktbilder und Galerie-Hauptbilder haben bereits 1024 × 768 px bzw. 400 × 300 px
sowie passende 4:3-Regeln. Logos haben HTML-Abmessungen und feste CSS-Größen.
Diese Container haben in den Messungen keinen bildbedingten Größenwechsel gezeigt.
Responsive WebP-Varianten, `srcset`, `sizes`, Priorisierung und Lazy Loading bleiben erhalten.

Die geprüften Einblendungsanimationen verwenden `transform` und `opacity`, keine animierten
Layoutgrößen oder Positionseigenschaften. Es wurde hierfür kein Layout-Shift nachgewiesen.
Sie wurden deshalb nicht ohne Anlass entfernt oder verändert.

## Umsetzung

- Die überschreibende Hero-Regel `aspect-ratio: auto` entfernt. Der Browser kann das
  HTML-Seitenverhältnis bis zum Bildladen nutzen; danach bleibt das natürliche Verhältnis gültig.
- Ein synchroner, kleiner Head-Bootstrap setzt vor dem ersten Paint `.js` am HTML-Element.
- Nur unter `.js` behalten verborgene Sortier-, Galerie- und Teilen-Controls ihre endgültige
  Flex-Layoutfläche. `visibility: hidden` hält sie bis zur vorhandenen JS-Initialisierung
  unsichtbar und aus Tastaturbedienung und Accessibility-Tree heraus. Keine feste Pixelhöhe nötig.
- Die mobile Galerie-Hinweismarke verwendet unter `.js` von Anfang an ihre endgültige Position.
- Ohne JavaScript fehlt `.js`: Controls bleiben wie bisher vollständig ausgeblendet.
  Katalog, Kategorien, Bildlinks und E-Mail-Anfragen funktionieren weiter.
- Allgemeine SVG-Icons erhalten `width="24" height="24"` und `focusable="false"`.
  Bestehende CSS-Abmessungen von beispielsweise 14, 17, 18 oder 22 px werden nicht überschrieben.
- `src/site.js`, `src/catalog.html.mustache`, `src/product.html.mustache` und
  `src/hero.html.mustache` wurden geprüft; ihre funktionale Logik bzw. ihr Markup musste
  für diese gezielte Korrektur nicht geändert werden.

## Gemessene Ergebnisse

Median aus jeweils drei Läufen. Nachher lagen auch Minimum und Maximum jeder Gruppe bei null.

| Seite              | Gerät   | Vorher normal | Vorher verspätete Ressourcen | Nachher normal / verspätet |
| ------------------ | ------- | ------------: | ---------------------------: | -------------------------: |
| Startseite         | Mobil   |      0,000000 |                     0,075212 |        0,000000 / 0,000000 |
| Startseite         | Desktop |      0,000503 |                     0,024056 |        0,000000 / 0,000000 |
| Kategorie Hochzeit | Mobil   |      0,000000 |                     0,005187 |        0,000000 / 0,000000 |
| Kategorie Hochzeit | Desktop |      0,003132 |                     0,003132 |        0,000000 / 0,000000 |
| Holzscheiben       | Mobil   |      0,000000 |                     0,033474 |        0,000000 / 0,000000 |
| Holzscheiben       | Desktop |      0,003898 |                     0,003898 |        0,000000 / 0,000000 |

Zusätzlich bestehen zwölf weitere Nachher-Läufe mit nativer Accessibility-Prüfung.
Sortierung, Galerie-Buttons und Teilen fehlen vor der Initialisierung im Accessibility-Tree
und erscheinen danach. Sechs Prüfungen mit vollständig deaktiviertem JavaScript bestätigen
statische Inhalte, echte Bild-/E-Mail-Links und vollständig ausgeblendete Controls.

Die kontrollierten Endpositionen und Größen der Seitenkomponenten sind vor und nach dem
Fix identisch. Beide Startseiten-Screenshots waren bereits im ersten Vergleich pixelidentisch.
Bei drei anderen Screenshots gab es geringe Rasterabweichungen, die auch zwischen zwei
unveränderten Nachher-Läufen auftraten. Der ergänzende Nachher-Lauf stimmt auf **allen sechs
Screenshots pixelgenau** mit dem Ausgangsstand überein. Die Ansichten wurden zusätzlich visuell geprüft.

## Regressionstests und Wiederholung

Voraussetzung: installierte Lockfile-Abhängigkeiten, ein für jsdom unterstützter Node
(hier 24.15.0) und lokal installiertes Chrome/Chromium. Bei abweichendem Installationsort
`CHROME_PATH` auf dessen ausführbare Datei setzen.

```sh
npm ci
# Nur bei fehlenden/veralteten Produktdaten, nicht parallel zur Seitengenerierung:
npm run transform
npm run mustache
npm run check:site
npm run test:site
npx --no-install tsc --noEmit
npm run check:cls -- --output tmp/cls-repeat.json --runs 3
```

Der Browsercheck ist optional und läuft nicht automatisch in GitHub Actions. Er prüft neben
CLS < 0,05 auch die Geometrie vor/nach der JS-Initialisierung (maximal 0,5 px Rundungsabweichung),
die native Accessibility und die Funktion ohne JavaScript. Er macht keine bezahlten API-Aufrufe
und öffnet keine E-Mail-Programme. `--diagnose` aktiviert die beschriebenen Gegenproben.

Erfolgreich ausgeführt: `mustache`, `check:site` (36 Produkte, 14 Kategorien, 56 Seiten,
478 Bildvarianten), `test:site` (**18 Tests**), `tsc --noEmit` und die Browsermessungen.
Die drei neuen DOM-Regressionstests prüfen Progressive Enhancement, den Ausfall des externen
Skripts, intrinsische Bild-/SVG-Abmessungen und die weiterhin maßgeblichen CSS-Icongrößen.
jsdom selbst misst keinen CLS; die Layoutprüfungen erfolgen ausschließlich in echtem Chrome.

## Verbleibende Ursachen und Grenzen

Im gemessenen Ladefenster sind nach dem Fix keine weiteren CLS-Ereignisse nachgewiesen.
Der ursprüngliche produktive Lighthouse-Wert von 0,101 ist damit nicht im gleichen Setup
nachgemessen. Nach Veröffentlichung sollte der ursprüngliche Lighthouse-Lauf mit denselben
Geräte-/Drosselungsbedingungen wiederholt werden. Für eine Aussage über reale Besucher sind
Feldmessungen erforderlich; die lokale Null ist keine Garantie für jede Gerätekonfiguration
oder die gesamte Nutzungsdauer. Es wurden weder Deployment noch Live-Kontoeinstellungen verändert.

Methodische Referenzen:
[CLS und Session-Fenster](https://web.dev/articles/cls),
[Layout-Shift-Attribution und Ursachensuche](https://web.dev/articles/debug-layout-shifts),
[Lighthouse-Drosselung](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md).
