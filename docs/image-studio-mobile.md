# Image Studio auf Mobilgeräten

Stand: 16. November 2026.

Die Optimierung betrifft ausschließlich das Image Studio unter `/image/`.
Die öffentliche Katalogseite und die Desktopgestaltung des Studios bleiben erhalten.

## Bedienung

- Pro Bild eine Karte mit den Tabs **Original**, **Prompt** und **Ergebnis**.
  Nur der gewählte Abschnitt ist sichtbar und per Tastatur erreichbar. Die Tabs unterstützen
  Pfeiltasten sowie Home/End und haben eindeutige ARIA-Beziehungen zu ihren Abschnitten,
  entsprechend dem [WAI-ARIA-Tabmuster](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
- Das Original kann vor dem Wechsel zum Prompt ausgewählt, gedreht und zugeschnitten werden.
  Der Button **Weiter zum Prompt** führt zum nächsten Abschnitt. Manuelle Prompts bleiben möglich.
- Ein ausdrücklich gestarteter Generierungsauftrag öffnet den Ergebnisabschnitt mit Fortschritt.
  Der Nutzer kann anschließend frei wechseln; die Fertigstellung wechselt den Tab nicht erneut.
  Status und Abbruch bleiben im Kartenkopf erreichbar. Der Ergebnistab markiert ein fertiges Bild.
- Wechsel zwischen Tabs, Geräteneigung oder Fenstergrößen bewahrt Eingaben, Referenzen,
  Ergebnisse, Kosten und laufende Anfragen. Jede Karte hat einen eigenen ausgewählten Tab.
- GitHub-Einstellungen und Aktionen sind auf Mobilgeräten zunächst eingeklappt.
  **Öffnen/Schließen** steuert den Bereich; auf Desktop ist er unverändert sichtbar.
- Größere Bedienflächen, 16-px-Eingabeschrift und einspaltige Formulare vermeiden seitliches
  Scrollen im Arbeitsbereich. Die Tabs bleiben innerhalb ihrer Karte beim Scrollen erreichbar.
- Touch-Ecken beim Zuschneiden haben einen größeren Trefferbereich und größere sichtbare
  Markierungen. Mausbedienung und Desktop-Markierungen bleiben unverändert.
- Dialoge verwenden die verfügbare dynamische Viewporthöhe. Das Viewport-Metatag nutzt
  `interactive-widget=resizes-content`, damit Chrome auf Android bei geöffneter Tastatur
  auch den Layout-Viewport verkleinert; siehe
  [Chrome-Dokumentation](https://developer.chrome.com/blog/viewport-resize-behavior).

Die gemeinsame Media Query lautet
`(max-width: 700px), (pointer: coarse) and (max-width: 1000px)`.
Sie deckt auch die Queransicht von Telefonen ab und muss in `studio.css`, `studio.js`
und `image-editor.js` übereinstimmen. Desktop verwendet weiterhin die bisherige 980-px-Mindestbreite
und drei gleichzeitig sichtbare Spalten. Neue mobile Elemente sind dort verborgen.
Der zusätzliche GitHub-Wrapper verwendet auf Desktop `display: contents` und erzeugt keine Layoutbox.

## Geprüft

`npm run build:image` und `npm run test:image` wurden erfolgreich mit Node 24.15.0 ausgeführt.
Alle **53 Tests** bestehen, darunter drei neue mobile DOM-Regressionen für Tabsteuerung,
eindeutige IDs, Entwurferhalt, Fokus bei Größenwechseln und laufende Generierungen.
API- und GitHub-Anfragen werden in diesen Tests simuliert.

Zusätzlich wurde die gebaute App in lokalem Headless Chrome mit Touch-Emulation geprüft:

| Viewport   | Prüfung                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| 320 × 800  | Tabs, GitHub-Aufklappen, kein horizontaler Überlauf, JPG-Download und Vollbild |
| 360 × 800  | dieselben Prüfungen                                                            |
| 412 × 915  | zusätzlich echter Touch-Drag am Zuschnittrahmen und Übernahme des Ausschnitts  |
| 700 × 1000 | dieselben Basisprüfungen am oberen schmalen Breakpoint                         |
| 915 × 412  | Touch-Queransicht mit weiterhin aktiven mobilen Tabs                           |
| 412 × 440  | GitHub-Dialog mit fokussiertem Textfeld bei simulierter Tastaturhöhe           |

Die Downloads erfolgten über Chromes echte Downloadfunktion. Die heruntergeladenen Dateien
wurden als JPEG mit 1024 × 768 Pixeln dekodiert. Die Touch-Geste veränderte den vorgesehenen
Zuschnittrahmen; nach Übernahme änderten sich die Pixelmaße der Referenz. Mehrere Bilder,
unabhängige Tabs und erhaltene Prompttexte wurden ebenfalls kontrolliert.

Bei **1440 und 1024 Pixeln Desktopbreite** wurden jeweils die leere Ansicht, ein hochgeladenes
Original mit Prompt und ein importiertes Ergebnis mit dem vor der Änderung separat gebauten
Stand verglichen. Alle sechs Screenshots sind pixelidentisch; alle kontrollierten Layoutpositionen
und -größen stimmen exakt überein.

Keine JavaScript-Fehler, fehlenden Ressourcen oder externen API-Anfragen während der Browserprüfung.
Screenshots, der JSON-Bericht und Download-Testdateien liegen im ignorierten `tmp/`-Verzeichnis
(`studio-mobile-browser.json`, `studio-*.png`, `studio-downloads/`) und werden nicht veröffentlicht.

Es wurde kein physisches Pixel 8 verwendet. Die kurze Tastaturhöhe wurde als verkleinerter
Viewport simuliert, nicht mit einer echten Android-Bildschirmtastatur. Eine abschließende Prüfung
auf dem eigenen Gerät bleibt daher sinnvoll. Es wurden keine kostenpflichtigen Anfragen,
echten GitHub-Schreibvorgänge oder Deployments ausgeführt.
