# Holzwerkskunst

## set openapi key

$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'OpenAI API key' -AsSecureString)).Password

### Bildbeschreibungen

Zu jedem Produktbild kann eine gleichnamige YAML-Datei liegen, zum Beispiel `10.jpg` und
`10.yaml` im selben Produktordner. Die Datei enthält ausschließlich:

```yaml
description: 'Holzbrett mit graviertem Feuerwehrmotiv und dem Namen Valentin'
```

`transform` übernimmt den Text in die Produktdaten. Die Website verwendet ihn als Alt-Text
auf Produktkarten, Vorschaubildern, im Galeriebild und in der vergrößerten Ansicht.
Fehlende oder ungültige Beschreibungen erzeugen eine Warnung; der Produktname dient als
Fallback und der Build läuft weiter. Anführungszeichen werden beim Rendern sicher maskiert.
Beim Umbenennen eines Bildes auch die zugehörige YAML-Datei umbenennen. Bilder in einem Ordner
brauchen eindeutige Basisnamen: `10.jpg` und `10.png` können nicht beide zu `10.yaml` gehören.
`spec.yaml` bleibt der Produktbeschreibung vorbehalten.

Fehlende Dateien zunächst kostenlos auflisten:

```sh
npm run describe:images
npm run describe:images -- --product brotzeitbrettchen --limit 5
```

Für die optionale KI-Erstellung wird ein lokal gesetzter `OPENAI_API_KEY` benötigt. Keine
Schlüssel in Dateien, Git oder Befehlsargumenten hinterlegen. In PowerShell lässt sich der
Schlüssel verdeckt eingeben:

```powershell
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'OpenAI API key' -AsSecureString)).Password
npm run describe:images -- --generate --product brotzeitbrettchen --limit 5
Remove-Item Env:OPENAI_API_KEY
```

Nur `--generate` startet kostenpflichtige Bildanalysen. Der Befehl verwendet den offiziellen
OpenAI-SDK mit der Responses API, standardmäßig `gpt-4.1-mini`; `--model` erlaubt ein anderes
bildfähiges Modell. Referenz: [OpenAI Images and vision](https://developers.openai.com/api/docs/guides/images-vision).
Bilder werden lokal auf maximal 1024 Pixel Kantenlänge verkleinert und an OpenAI gesendet.
Es gibt keine automatischen Wiederholungen. Bestehende YAML-Dateien werden nie überschrieben,
auch nicht nach einem Abbruch oder wenn sie ungültig sind. Fehler hinterlassen bereits erfolgreich
erstellte Dateien; beim nächsten Aufruf werden nur die noch fehlenden Dateien bearbeitet.
Die Ausgabe nennt die gemeldete Token-Nutzung; sie ist keine Kontostands- oder Kostenanzeige.

KI-Texte vor Veröffentlichung prüfen. Wenn ein Bild ersetzt wird, dessen YAML bewusst löschen
oder selbst aktualisieren; es gibt keinen Hash und keine automatische Änderungserkennung.
Nach Änderungen `npm run check`, `npm run transform` und `npm run mustache` ausführen.
Build und Deployment rufen keine KI auf. Tests laufen ohne API-Key und ohne bezahlte Anfragen:

```sh
npm run test:descriptions
```

### Katalog entwickeln und prüfen

Die Website wird mit TypeScript und Handlebars statisch erzeugt. Voraussetzung: Node.js 22+
und installierte Abhängigkeiten (`npm ci`).
Die jsdom-Regressionstests benötigen Node.js 22.22.2+, 24.15.0+ oder 26+.

```sh
npm run check
npm run transform
npm run mustache
npm run check:site
npx --no-install tsc --noEmit
npm start
```

Nach `transform`, `mustache` und `build:image` führt `npm test` alle Regressionstests aus.
Einzeln lassen sie sich mit `test:seo`, `test:descriptions`, `test:site` und `test:image` starten.
OpenAI-, GitHub- und Wechselkurs-Anfragen werden simuliert; es entstehen keine API-Kosten,
echten GitHub-Änderungen oder E-Mails. DOM-Tests prüfen Galerie, Bildlinks, Kontakt und
Studio-Dialoge mit jsdom. Canvas und Bilddekodierung sind dort simuliert; Layout und native
Browser-Funktionen müssen weiterhin im Browser geprüft werden. Die Transform-Tests prüfen
WebP-Abmessungen und Transparenz zusätzlich mit echter Sharp-Bildverarbeitung.

Die lokale Vorschau läuft unter `http://localhost:4200`. Nach Änderungen an Vorlagen,
`src/site.css` oder `src/site.js` erneut `npm run mustache` ausführen. Der Server beobachtet
keine Quelldateien. `transform` verarbeitet alle Bilder neu; nicht gleichzeitig mehrfach starten.
Aus den JPG-/JPEG-/PNG-Originalen erzeugt Sharp WebP-Dateien in 400 × 300 und 1024 × 768 Pixeln
mit Qualität 85. Die Bilder werden eingepasst, nicht zugeschnitten; Transparenz bleibt erhalten.
Quelldateien und Bildbeschreibungen bleiben unverändert. Produktdaten, Vorlagen und Sitemap
verwenden automatisch die erzeugten `.webp`-Dateinamen. Alle Bildverarbeitungsskripte verwenden Sharp.
Vorher prüft `transform` alle Bildabmessungen und meldet sämtliche ungültigen oder nicht lesbaren
Bilder zusammen. Erst wenn alle Bilder das 4:3-Format erfüllen, wird der Ausgabeordner neu erstellt.
Bei Fehlern bleiben die bisherigen Ausgabedateien erhalten. Die Vorabprüfung lässt sich mit
`node --test scripts/transform.test.mjs` anhand isolierter Beispieldaten testen.
Die Seitengenerierung versieht CSS- und JavaScript-URLs mit Inhalts-Hashes, damit Browser nach
Änderungen die passende Version laden. `node --test scripts/site.test.mjs` prüft nach der
Generierung diese URLs und die sichere Initialisierung bei unvollständigem Katalog-Markup.

Das Designsystem liegt in `src/site.css`: warme Cremeflächen, Salbeigrün, lokale Serifenschriften
für Headlines und Systemschriften für Fließtext. Externe Schrift- und UI-CDNs sind nicht nötig.
Die Hero-Bildquelle wird in `mustache.ts` gewählt. Aktuell wird
`src/assets/werkstatt.png` als WebP in 480, 768, 1024 und 1440 Pixel Breite erzeugt und im
Originalseitenverhältnis gezeigt. Für Social-Media-Vorschauen bleibt zusätzlich eine JPEG-Version
mit 1440 Pixel Breite erhalten. Die Startseite
folgt dem Aufbau Header → geteilter Hero → Kategorie-Icons → alle Produkte → Personalisierung
in drei Schritten → „Das sind wir“ → Footer. Der Hero zeigt links den Text und rechts das Foto
mit überlappender Bildunterschrift. „Das sind wir“ steht direkt vor dem Footer.
Die Produktkarten zeigen nur Bild, Name und Pfeil. Beschreibungen und Tags bleiben auf den
Detailseiten erhalten.

Das eigene Logo liegt in `src/assets/logo.png` und erscheint in Header, Footer und im
Bildplatzhalter auf Start- und Über-uns-Seite. `npm run mustache` erzeugt mit Sharp eine
144 × 144 px große Webversion und ein 48 × 48 px großes Favicon. `npm run build:image`
verwendet dieselbe Quelldatei für Logo und Favicon des Bildstudios. Die Originaldatei bleibt
unverändert; Inhalts-Hashes verhindern veraltete Logos im Browser-Cache.
Nach beiden Builds prüft `npm run check:branding` sämtliche erzeugten HTML-Seiten einschließlich
Bildstudio auf das aktuelle Logo, gültige Bilddateien und verbliebene alte Logo-Einbindungen.

Die Icon-Leiste basiert auf allen vorhandenen Produkt-Tags. Auf Start- und Kategorieseiten navigiert
ein Klick direkt zur jeweiligen `/kategorie/<tag>.html`-Seite;
„Alle Kategorien“ setzt die Auswahl zurück. Mehrfach zugeordnete Produkte erscheinen in jeder
passenden Kategorie. Die Sortierung bietet Standard (alphabetisch), Neueste zuerst, Name A–Z
und Name Z–A. Die Kategorie wird ausschließlich durch den `/kategorie/`-Pfad bestimmt;
nur die Sortierung verwendet den Queryparameter `sort`. Alte `tag`- und Suchparameter werden
beim Laden entfernt. Zurück/Vorwärts im Browser stellt die Auswahl wieder her. Das funktioniert
auch auf den bestehenden Kategorieseiten. Ohne JavaScript führen die Icons zu diesen Seiten.
Die Website besitzt keine Suchfunktion.

Die Kategorie-Icons stammen aus Lucide und liegen als ausgewählte SVGs unter
`src/assets/icons/lucide/`. Der Upstream-Stand und die Lizenz sind dort dokumentiert.
Die Zuordnung zu Produkt-Tags erfolgt in `mustache.ts`; der Helper `categoryIcon` bettet
die SVGs beim Seitenbau direkt ein. Es werden keine Icon-Webfont, kein CDN und kein
zusätzliches Browser-JavaScript benötigt. Die Lizenz wird nach `assets/licenses/lucide.txt`
kopiert. Größe, Farbe und Strichstärke werden in `src/site.css` festgelegt.

Die Vorstellung befindet sich in `src/home.html.mustache` und `src/about.html.mustache`;
die eigene Seite wird unter `/ueber-uns.html` erzeugt. Der Text ist der vorläufige Entwurf.
Mangels authentischem Foto zeigt `src/about-photo.html.mustache` eine neutrale Illustration.
Für ein echtes Foto einfach `src/about-photo.jpg` ergänzen und `npm run mustache` ausführen.
Sharp erzeugt daraus `/assets/about-photo.webp` mit maximal 1440 Pixel Breite; die Quelle bleibt unverändert.
Der Generator kopiert das Bild und ersetzt den Platzhalter auf beiden Seiten automatisch.

Produktgalerien unterstützen Vorschaubilder, Pfeiltasten, Wischgesten und eine vergrößerte
Dialogansicht. Escape schließt Dialoge. Anfragen öffnen zuerst die Kontaktdaten; erst der
E-Mail-Link öffnet das eigene Mailprogramm. Bei Produktanfragen sind Titel und Produktlink
vorausgefüllt. Jede Bildauswahl aktualisiert die URL ohne Neuladen, zum Beispiel
`/produkt/brotzeitbrettchen/#10` für `10.jpg`. Der Bildname ohne Dateiendung ist die Kennung;
Sortierung und WebP-Bildgrößen ändern diese Kennung nicht. Geteilte Links wählen das passende
Bild beim Öffnen aus. Fehlende oder ungültige Kennungen zeigen das erste Bild.
„Teilen“ und E-Mail-Anfragen übernehmen den Produktlink mit der ausgewählten Bildkennung.
Separate Dateinamen und direkte Bildlinks werden nicht in die E-Mail eingefügt. Die Browser-Historie erhält beim
Bildwechsel keine zusätzlichen Einträge. Canonical-URLs und Social-Media-Vorschaubilder bleiben
produktbezogen; Umbenennen oder Löschen eines Originals macht alte Bildkennungen ungültig.
Es gibt keinen automatischen Versand und keinen neuen Backend-Dienst.
Ohne JavaScript funktionieren Produkt-, Bild-, Kategorie- und E-Mail-Links weiterhin.

Die FAQ-Seite unter `/faq.html` beantwortet häufige Fragen zu Personalisierung und Anfragen.
Die Inhalte stehen in `src/faq.html.mustache`; die aufklappbaren Antworten funktionieren auch
ohne JavaScript. Navigation und Footer verlinken die Seite. Metadaten, Breadcrumbs und die
Aufnahme in die Sitemap erzeugt `npm run mustache` automatisch.

`check:site` prüft nach der Generierung alle Katalogseiten, interne Links, responsive Bildquellen,
vollständige Galerien, Überschriften und Metadaten. Produkttexte, Tags, Daten und URLs werden
gegen die YAML-Quellen abgeglichen. Zusätzlich sollten Start-, Kategorie- und Produktseiten
bei 320, 390, 768 und 1440 px im Browser geprüft werden: Menü, Icon-Filter, Sortierung,
Zurücksetzen, Galerie, Anfrage, Fokus und reduzierte Bewegung.

Das Image Studio unter `/image/` wird separat gebaut und bleibt vom Katalogdesign unabhängig.
Ein Push auf `main` veröffentlicht über den bestehenden GitHub-Pages-Workflow.

### SEO prüfen und pflegen

Analyse, priorisierte Maßnahmen und Prüfergebnisse stehen in
[docs/seo-massnahmenplan.md](docs/seo-massnahmenplan.md).
`seo.ts` definiert die kanonische Katalog-Domain ohne `www`, die aus vorhandenen
Inhalten abgeleiteten Metadaten, sicher serialisierte strukturierte Daten und die
Bilder-Sitemap. `npm run mustache` erzeugt `dist/bootstrap/sitemap.xml`; `robots.txt`
verweist darauf. Erstellungsdaten werden nicht als Änderungsdaten ausgegeben.
Vollständige Produkttexte und bestehende Produkt-URLs bleiben erhalten.

Nach beiden Builds prüfen:

```sh
npm run mustache
npm run build:image
npm run check:site
npm run check:seo
npm run check:branding
npm run test:seo
npm run test:site
```

Diese Ausgabe- und Regressionstests laufen auch vor dem GitHub-Pages-Deployment.
Kategorieseiten enthalten ausschließlich zugeordnete Produkte. Bei Galerieänderungen
müssen `src` und `srcset` gemeinsam wechseln; die Lightbox nutzt weiterhin das große Bild.
Das Bildstudio und die Fehlerseite sind `noindex, follow` und fehlen bewusst in der Sitemap.
Sie werden in robots.txt nicht gesperrt, damit Crawler die Anweisung lesen können.

### Veröffentlichung mit GitHub Pages

`.github/workflows/deploy.yaml` baut nach einem Push auf `main` oder einem manuellen Start
die Website und das Bildstudio mit `npm ci`. Nach allen Prüfungen wird ausschließlich
`dist/bootstrap/` als Pages-Artefakt hochgeladen und in einem separaten Job veröffentlicht.
Der Veröffentlichungsjob läuft nur für `main`; parallele Läufe werden nacheinander ausgeführt.
Das Upload-Artefakt wird einen Tag aufbewahrt; die veröffentlichte Website bleibt danach erreichbar.

Für den Wechsel einmalig im GitHub-Repository unter **Settings → Pages → Build and deployment →
Source** die Option **GitHub Actions** auswählen. Unter **Custom domain** muss weiterhin
`holzwerkskunst.de` stehen. Die Umgebung **Settings → Environments → github-pages** muss
Deployments von `main` zulassen; eine bisherige Beschränkung auf `gh-pages` entsprechend ändern.
Anschließend den Workflow auf `main` ausführen oder die Änderung dorthin pushen.
Es werden keine zusätzlichen PATs oder Secrets benötigt.

Die erzeugten Dateien werden künftig nicht mehr in `gh-pages` eingecheckt. Der bisherige Branch
und alte Bildversionen bleiben erhalten; diese Umstellung verkleinert die vorhandene Git-Historie
nicht automatisch. Neue und ersetzte Originalbilder unter `products/` bleiben weiterhin versioniert.

Nach Veröffentlichung die Sitemap in Search Console einreichen und die GitHub-Pages-
Einstellung **Enforce HTTPS** prüfen. Ungeklärte Anschriften sowie fehlende Preis- und
Bewertungsdaten werden nicht durch erfundene strukturierte Angaben ersetzt.

### Image studio

With Node.js 22+ and dependencies installed, run `npm run start:image` to build and open the product-image studio.
Enter and save your API key in the studio's **API-Schlüssel** settings (browser Local Storage).
The studio runs entirely in the browser and calls OpenAI directly; hosting needs no Node.js backend.
The GitHub Action includes it at `https://holzwerkskunst.de/image/` after the next deployment.
`npm run build:image` bundles the official [OpenAI JavaScript SDK](https://github.com/openai/openai-node)
and prepares the public assets in `dist/bootstrap/image/` for static hosting.
Node.js is only needed for local npm commands and the repository's build, not for the hosted studio.
See [image-studio/README.md](image-studio/README.md) for setup, the three-column workflow, and checks.

Im Bereich **GitHub · Produktbilder** lässt sich ein eigener GitHub-Token separat im Browser
speichern. Der Dialog **Zu Produkten hinzufügen** bietet oben eine Kategorie-/Produktordner-Auswahl
und darunter kleine Bildvorschauen mit Dateinamen in derselben Reihenfolge wie auf der Website;
**Neues Produkt erstellen** öffnet dort einen Dialog für Name, ID, Beschreibung, Datum und Kategorien.
Über **Zu Produkten hinzufügen**
erstellt OpenAI eine editierbare deutsche Bildbeschreibung aus dem fertigen JPEG (kostenpflichtig).
Erst nach Prüfung werden Bild und gleichnamige YAML-Datei in einem gemeinsamen Pull Request gesammelt.
Die Hauptansicht besteht weiterhin aus den drei Spalten Original, Prompt und Ergebnis.
Im GitHub-Bereich lässt sich jeder vorhandene Branch außer `main` und `gh-pages` auswählen.
Uploads landen im gewählten Branch; **Branch mergen** übernimmt dessen sämtliche Änderungen nach `main`.
Bei neuen Produkten kommt die `spec.yaml` zusammen mit dem ersten Bild hinzu. Erst
**Branch mergen** übernimmt den geprüften Stand nach `main` und startet das Deployment.
Ein zusätzlicher Validierungsworkflow ist dafür nicht erforderlich.
Token-Rechte, Sitzung fortsetzen und Veröffentlichung sind im
[Studio-Handbuch](image-studio/README.md#github-products-and-pull-requests) beschrieben.

### DNS

original all-inkl A-Record was: 85.13.144.110. Delete CName as well
