# SEO-Analyse und priorisierter Maßnahmenplan

Stand: 4. November 2026. Grundlage: vollständige Prüfung der Generatoren, Vorlagen,
Produktquellen, Navigation, Galerie, Bildstudio und Deployment-Konfiguration sowie
schreibgeschützte HTTP-Prüfungen der veröffentlichten Domain. Design, Produkttexte,
Produkt-URLs, Kategorien und Funktionen bleiben erhalten. Änderungen werden lokal
vorbereitet; veröffentlicht wird über den bestehenden GitHub-Pages-Workflow.

## Ausgangslage

- 36 Produkte und 14 Kategorien; einschließlich Startseite, Über uns, Rechtstexten
  und Fehlerseite entstehen 55 Katalogseiten, zusätzlich das Bildstudio.
- 229 Originalbilder bestehen die vorhandene 4:3-Prüfung. Der Generator erzeugt
  kleine und große Bildvarianten. Hero-Bild, CSS und JavaScript werden lokal geladen.
- Gute Grundlagen: statisches HTML, deutsche Seitensprache, sprechende stabile
  Produkt-URLs, einzelne H1 pro Seite, responsive Darstellung, Bildabmessungen,
  Canonicals und Open Graph bereits vorhanden. Produkt-, Kategorie-, Bild- und
  Anfrage-Links funktionieren grundsätzlich auch ohne JavaScript.
- Die veröffentlichte Hauptseite antwortet unter `https://holzwerkskunst.de/` mit
  HTTP 200, nennt jedoch `https://www.holzwerkskunst.de/` als Canonical. Die
  www-Adresse leitet mit HTTP 301 wieder auf die Domain ohne www um.
- `/sitemap.xml` liefert HTTP 404. `robots.txt` erlaubt Crawling, nennt aber keine Sitemap.
- HTTP statt HTTPS lieferte beim Abruf ebenfalls 200 ohne Weiterleitung. Die
  Durchsetzung von HTTPS ist eine Hosting-Einstellung, keine HTML-Eigenschaft.
- Produktbeschreibungen werden ungekürzt als Meta-Beschreibungen verwendet.
  Die 36 Produkt-Metabeschreibungen umfassen vor der Optimierung 516–599 Zeichen.
  Start- und Kategorietitel können die tatsächliche Suchintention klarer ausdrücken.
- Kategorieseiten liefern auch sämtliche unpassenden Produktkarten aus und
  verstecken sie erst mit CSS/JavaScript. Das vergrößert HTML und wiederholt Inhalte.
  Insgesamt werden 504 Karten ausgeliefert, obwohl nur 163 Kategoriezuordnungen bestehen.
- Es fehlen strukturierte Daten, eine automatisierte SEO-Prüfung und eine explizite
  Indexierungsregel für das Bildstudio. Die echte Fehlerseite liefert korrekt 404
  und besitzt bereits `noindex`.
- Impressum und Kontaktbereich nennen unterschiedliche Personen/Anschriften.
  Deshalb lässt sich eine verbindliche Geschäftsadresse nicht zuverlässig ableiten.

## Priorisierung vor der Umsetzung

| Priorität | Maßnahme                                                                                                                | Nutzen                                                                     | Umsetzung                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P0        | Canonical-Domain an die echte Weiterleitung und das CNAME anpassen; auch Open Graph und Produkt-Anfragelinks angleichen | Widersprüchliche URL-Signale beseitigen                                    | Direkt im Generator und automatisiert prüfen                          |
| P0        | XML-Sitemap einschließlich Produktbildern erzeugen und in robots.txt bekannt machen                                     | Auffindbarkeit aller gewünschten Seiten und Galeriebilder                  | Direkt im Build; nur kanonische, indexierbare URLs                    |
| P0        | Bildstudio und Fehlerseite ausdrücklich von Indexierung ausnehmen                                                       | Werkzeug-/Fehlerseiten nicht als Katalogseiten behandeln                   | `noindex, follow`; Crawling dafür weiterhin erlauben                  |
| P1        | Eindeutige, sachliche Titel und kompakte individuelle Meta-Beschreibungen                                               | Suchergebnisse verständlicher und unterscheidbar machen                    | Aus vorhandenen Inhalten ableiten; vollständige Produkttexte erhalten |
| P1        | Nur zur jeweiligen Kategorie gehörende Karten statisch ausliefern                                                       | Relevantere Dokumente und weniger unnötiges HTML                           | Kategoriepfade und Sortierfunktion unverändert erhalten               |
| P1        | WebSite, Organization, WebPage/CollectionPage/AboutPage, BreadcrumbList und ItemList als JSON-LD                        | Seiten, Navigation, Betreibername und Produktlisten maschinenlesbar machen | Nur nachweisbare Angaben; JSON sicher einbetten                       |
| P1        | Hauptproduktbilder responsiv laden; Galerie synchron halten; erste Kategoriebilder nicht verzögert laden                | Mobile Bildlast reduzieren und sichtbare Bilder früher laden               | Bestehende Varianten, gleiche Gestaltung und Bildqualität             |
| P1        | SEO-Ausgabe und interne Referenzen vor Deployment prüfen                                                                | Fehler künftig vor Veröffentlichung erkennen                               | Neuer vollständiger Ausgabe-Audit und CI-Schritt                      |
| P2        | Social-Metadaten vervollständigen und große Bildvorschauen erlauben                                                     | Korrekte Vorschaubilder und konsistente Seitendaten                        | Unsichtbare Head-Metadaten                                            |
| P2        | HTTPS erzwingen, Sitemap in Search Console einreichen und Indexierung beobachten                                        | Hosting und Erfolgskontrolle ergänzen                                      | Nach Deployment im jeweiligen Betreiberkonto                          |
| P3        | Geschäftsangaben verifizieren, authentisches Über-uns-Foto, gezielte Kategorie-Inhalte und Unternehmensprofil pflegen   | Vertrauen und lokale Auffindbarkeit verbessern                             | Redaktionell/organisatorisch; keine Fakten erfinden                   |

## Bewusste Grenzen

Keine erfundenen Preise, Bewertungen, Lieferzeiten, Lagerbestände, Öffnungszeiten
oder Standorte. Der Katalog nimmt individuelle Anfragen entgegen und besitzt keine
Preis-/Bewertungsdaten für Google-Produkt-Rich-Results. Entsprechendes Product-/Offer-
Markup bleibt zurückgestellt. Allgemeine Seiten-, Listen- und Breadcrumb-Daten
lassen sich dagegen korrekt aus dem Projekt gewinnen. LocalBusiness-Daten mit
Anschrift werden erst nach Klärung der widersprüchlichen Geschäftsangaben sinnvoll.

Keine unsichtbaren Keyword-Texte, keine erfundene Suchfunktion, keine neuen
Trackingdienste oder Cookies und keine Änderung bestehender Produktpfade. Sortier-
Parameter erhalten weiterhin den Canonical der jeweiligen Grundseite. Deutsche
Einsprachigkeit benötigt keine künstlichen hreflang-Varianten. Eine Sitemap erhält
keine erfundenen Änderungsdaten: Produkt-Erstellungsdaten sind keine `lastmod`-Daten.

Eine Meta-Beschreibung von ungefähr 160 Zeichen ist hier ein redaktioneller
Richtwert, keine technische Google-Grenze. Google kann Titel und Beschreibungen
anders darstellen. Rankings, Impressionen und reale Core Web Vitals sind ohne
Search Console beziehungsweise Nutzungsdaten nicht aus dem Quellcode ableitbar.

## Nach dem Deployment

1. In GitHub Pages die Option **Enforce HTTPS** prüfen/aktivieren und HTTP-/www-
   Weiterleitungen einschließlich Unterseiten erneut testen. Aus dem Repository
   allein lässt sich diese Kontoeinstellung nicht setzen.
2. `https://holzwerkskunst.de/sitemap.xml` in der Google Search Console einreichen.
   Startseite sowie repräsentative Produkt- und Kategorieseiten mit URL-Prüfung
   und Rich Results Test kontrollieren; Crawling und Indexierung benötigen Zeit.
3. Geschäftsname und Anschrift in Impressum, Kontaktangaben und gegebenenfalls
   Google-Unternehmensprofil verbindlich abgleichen. Bis dahin keine Adresse ergänzen.
4. Suchanfragen, Klickrate, Indexierungsfehler und Felddaten regelmäßig prüfen.
   Erst mit diesen Daten weitere Inhalte und Performance-Maßnahmen priorisieren.

## Quellen für die technischen Entscheidungen

- [Google: Canonical-URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: Sitemaps erstellen](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: Bild-SEO](https://developers.google.com/search/docs/appearance/google-images)
- [Google: Titel](https://developers.google.com/search/docs/appearance/title-link)
- [Google: Meta-Beschreibungen](https://developers.google.com/search/docs/appearance/snippet)
- [Google: Breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google: Robots-Metadaten](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Google: Voraussetzungen für Produkt-Snippets](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [web.dev: Bild-Lazy-Loading](https://web.dev/articles/browser-level-image-lazy-loading)

## Umsetzung und Nachweise

### Direkt umgesetzt

P0/P1 und die im Repository umsetzbaren P2-Maßnahmen sind abgeschlossen:

- Canonical, Open Graph, strukturierte Daten und Produkt-Anfragelinks verwenden
  einheitlich `https://holzwerkskunst.de`. Teilen verwendet weiterhin den Canonical.
- Der Seitenbuild erstellt `sitemap.xml` mit 54 kanonischen, indexierbaren URLs und
  230 Bildverweisen: sämtliche 229 großen Produktbilder plus das Startseitenbild.
  Die XML-Ausgabe wurde zusätzlich mit einem echten XML-Parser geprüft.
- `robots.txt` nennt die Sitemap. Bildstudio und Fehlerseite besitzen
  `noindex, follow` und erscheinen nicht in der Sitemap.
- Alle 54 indexierbaren Seiten besitzen eindeutige Titel und Beschreibungen,
  vollständige Open-Graph-/Twitter-Vorschauen und sichere JSON-LD-Daten.
  Die Produkt-Metabeschreibungen sind nun 149–159 Zeichen lang, die sichtbaren
  Beschreibungen bleiben vollständig aus den YAML-Quellen erhalten.
- Kategorien liefern zusammen 163 passende statt 504 überwiegend versteckte Karten.
  Sortierung, Zurück/Vorwärts und native Kategorie-Links funktionieren weiter.
- Responsive Hauptbilder und an die bestehenden CSS-Breiten angepasste `sizes`
  verwenden die vorhandenen Bildvarianten. Galerieauswahl aktualisiert `src` und
  `srcset` gemeinsam; die Lightbox behält das große Bild. Erste Kategoriebilder
  laden ohne Lazy-Verzögerung. Galerie-Alternativtexte unterscheiden die Ansichten.
- `check:seo`, `test:seo` und `test:site` ergänzen die vorhandenen Prüfungen.
  Katalog-/Link-, SEO- und Branding-Audits sowie die SEO- und Website-Regressionstests
  sind im bestehenden GitHub-Deployment vorgeschaltet.
- Im ignorierten lokalen Ausgabeordner lagen zusätzlich alte Bootstrap-Demoseiten
  aus 2024. Sie wurden reversibel nach `tmp/seo-legacy-bootstrap-examples/`
  ausgelagert. Sie gehören nicht zu den aktuellen Quellen oder frischen CI-Builds.

### Messwerte und Funktionsprüfung

- Vollständiger Katalogaudit: 36 Produkte, 14 Kategorien, 55 Katalogseiten,
  458 vorhandene Bildvarianten und 4.345 lokale Links. Produktinhalte und bestehende
  Produkt-URLs stimmen weiterhin mit den Quellen überein.
- SEO-Audit einschließlich Studio: 56 Seiten, 54 Sitemap-URLs, 54 gültig lesbare
  JSON-LD-Graphen und alle Produktgalerien in der Sitemap.
- Branding-Audit: alle 56 HTML-Seiten, 113 Logo-Einbindungen und aktuelle Favicons.
- Unkomprimierte HTML-Gesamtgröße über die 55 Katalogseiten: vorher 1.949.095 Bytes,
  nachher 1.723.731 Bytes, also rund **11,6 % weniger**, trotz zusätzlicher Metadaten.
  Das ist eine lokale Dateigrößenmessung, keine gemessene Ranking-/Core-Web-Vitals-Steigerung.
- Browserbeispiel bei 390 Pixeln und DPR 1: ein Galeriebild lädt mit 62.803 statt
  297.124 Bytes, rund 78,9 % weniger. Größere Bildschirme/Pixeldichten können weiter
  die große Variante wählen; große Originalansicht und Downloads bleiben verfügbar.
- Vorher-/Nachher-Vergleich von Start-, Kategorie- und Produktseite bei 1440 und
  390 Pixeln: gleiche sichtbare Texte, Layoutmaße, Farben und Navigation. Fünf der
  sechs Bildvergleiche zeigen keine Abweichung bei der verwendeten Bildtoleranz;
  die mobile Produktaufnahme unterscheidet sich erwartungsgemäß geringfügig durch
  die kleinere responsive Bildquelle. Stylesheet und Produktquellen sind unverändert.
- Browserprüfung zusätzlich bei 320 und 768 Pixeln sowie für alle 36 Produkt- und
  14 Kategorieseiten: keine JavaScript-Fehler, keine fehlenden Ressourcen und kein
  horizontaler Seitenüberlauf. Geprüft wurden Sortierung mit Browser-Historie,
  mobiles Menü, Galerie, Tastatur, Lightbox, Anfrage-Dialog, Teilen sowie Navigation
  und E-Mail-Links ohne JavaScript. Studio-Upload und API-Einstellungen bleiben vorhanden.
- TypeScript-Prüfung erfolgreich. SEO-Hilfsfunktionen und Website-Regressionen
  einschließlich synchroner Galeriequellen werden automatisiert getestet.

Die Änderungen sind lokal umgesetzt und gebaut, noch nicht veröffentlicht.
HTTPS-Kontoeinstellung, Search Console und die Verifizierung der Geschäftsangaben
bleiben die oben genannten Schritte außerhalb des Repositorys. Es wurden keine
kostenpflichtigen OpenAI-Aufrufe und keine Tracking-/Kontoänderungen ausgeführt.
