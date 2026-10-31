# Project guidance

## Purpose and architecture

Holzwerkskunst.de is a German-language catalog of handmade wood and paper products.
Visitors browse products and categories and contact the maker with inquiries.

This repository builds a static website with Node.js, TypeScript, Jimp, YAML, and
Handlebars. Despite the directory name and Angular remnants in `tsconfig.json`,
the current application does not use Angular. Templates have a `.mustache`
extension, but `mustache.ts` renders them with Handlebars.

## Source map

- `products/<folder>/spec.yaml`: product metadata (`id`, `name`, `description`,
  `date`, and `tags`). Images live alongside the specification.
- `transform.ts`: reads product folders, resizes images, and writes product data
  and images into `dist/bootstrap/produkt/`.
- `mustache.ts`: reads generated product data, registers template partials, builds
  page models and Open Graph metadata, and writes static HTML.
- `src/index.html.mustache`: shared page shell, navigation, contact dialog, and footer.
- `src/site.css`: responsive design, typography, colors, and layout; uses local serif headlines
  and system sans-serif body fonts.
- `src/site.js`: progressive enhancements for navigation, contact, category filtering and sorting,
  the product gallery, and sharing. No frontend framework or CDN assets are required.
- `src/home.html.mustache`, `src/category.html.mustache`, and
  `src/preview.html.mustache`: catalog listings and reusable product cards.
- `src/hero.html.mustache`, `src/personalization.html.mustache`: split text/photo hero and
  sage-colored three-step personalization section.
  `mustache.ts` uses the existing Jimp dependency to generate responsive JPEG hero variants from
  `src/assets/werkstatt.png`; keep the template's `sizes` aligned with the CSS layout.
- `src/catalog.html.mustache`: compact catalog heading, sorting and product grid.
- `src/category-nav.html.mustache`: all real product tags as clickable category icons.
- `src/assets/icons/lucide/`: selected official category SVGs with a pinned upstream commit and license.
  `mustache.ts` embeds them via `categoryIcon` and publishes the license at `assets/licenses/lucide.txt`.
- `src/header.html.mustache`, `src/footer.html.mustache`, `src/brand.html.mustache`: shared navigation and branding.
- `src/assets/logo.png`: shared original brand logo for all pages, the about placeholder and image studio.
  Page and studio builds generate 144px logos and 48px PNG favicons with content-versioned URLs.
- `src/about.html.mustache`, `src/about-photo.html.mustache`: about page and replaceable photo placeholder.
  Optional `src/about-photo.jpg` is copied automatically by the page generator.
- `scripts/check-site.mjs`: generated catalog audit for source preservation, links and images.
- `scripts/check-branding.mjs`: checks every generated HTML page, including image studio, for current logos and favicons.
- `src/product.html.mustache`: product details, images, and sharing behavior.
- Other `src/*.mustache` files: legal and 404 pages.
- `src/robots.txt`: copied into the generated site.
- `check.ts`: checks product images for a 4:3 aspect ratio.
- `.github/workflows/deploy.yaml`: generation and GitHub Pages deployment.
- `dist/`, `node_modules/`, and `.angular/cache/`: ignored generated content.
- `image-studio/`: static browser app for image analysis and generation; see
  `image-studio/README.md`. Its `public/` assets run without a Node.js backend.
  `npm run build:image` bundles the official `openai` SDK with esbuild and copies a public-file allowlist to
  `dist/bootstrap/image/`, deployed with the catalog at `/image/`.
  `npm run start:image` provides an optional local static preview.

## Local workflow

Run commands from the repository root with Node.js 22 or newer. Deployment uses Node.js 22.

```sh
npm ci
npm run check
npm run transform
npm run mustache
npm start
```

- `check` validates source image dimensions; it is not a general test suite.
- `transform` generates 400x300 and 1024x768 images and `products.json`.
  It checks all source image dimensions first and reports all invalid images together.
  Only after a successful check does it delete and recreate `dist/bootstrap/produkt/`, so keep original assets in
  `products/` and make source changes outside the generated directory.
- `mustache` requires the generated `products.json` and product directories.
  It also copies `src/site.css` and `src/site.js` to `dist/bootstrap/assets/`.
- `start` serves `dist/bootstrap/` at `http://localhost:4200`; it does not build
  or watch source files. Rerun generation after edits.
- There is no `build` or general `test` npm script. `npm run test:image` runs the
  image studio tests using mocked OpenAI responses and no paid API calls.
  TypeScript can be checked separately
  with `npx --no-install tsc --noEmit`.
- `npm run check:site` audits generated catalog pages after `transform` and `mustache`.
  It checks product data against YAML sources, all image variants, local links and metadata.
- `npm run check:branding` checks every generated HTML page after `mustache` and `build:image`.

## Product conventions

- Each product folder needs a `spec.yaml` and at least one JPG, JPEG, or PNG image.
- Keep product IDs unique and suitable for URLs. IDs determine the public
  `/produkt/<id>/` paths; preserve existing IDs unless changing URLs is intended.
- Follow existing YAML specifications; quote dates as `YYYY-MM-DD` strings.
- Source photos must have a 4:3 aspect ratio, with the existing ratio tolerance
  of 0.01. Image processing uses containment rather than cropping.
- Products are displayed alphabetically by name. Numeric filename prefixes such
  as `100__photo.jpg` control image ordering; unnumbered images sort afterward.
- Tags generate navigation entries and `/kategorie/<tag>.html` pages directly.
  Preserve tag spelling and capitalization when assigning existing categories.

## Editing and validation

- Edit templates, product sources, and generator scripts rather than generated
  HTML or JSON in `dist/`.
- Keep user-facing copy in German and preserve UTF-8 characters and umlauts.
- Keep the warm cream surfaces, soft sage accents, sand-colored footer,
  serif headlines and clean sans-serif body typography consistent. Use the palette variables in `src/site.css`
  for component colors and preserve readable text contrast.
  Use the compact sticky header. Product cards contain only the linked image, name and arrow;
  keep tags and full descriptions on detail pages. The homepage order is photo hero, category icons,
  complete catalog, three-step personalization, about section, footer. The hero image source
  (`src/assets/werkstatt.png`) is configured and copied by `mustache.ts`; preserve its native aspect ratio.
  The catalog defaults to alphabetical order and supports category pages and date/name sorting.
  Category icons use native category-page links; never intercept them or encode categories in query parameters.
  Keep search absent and preserve category and inquiry links without JavaScript.
- Follow `.prettierrc`: two-space indentation, single quotes, no bracket spacing,
  a 100-character print width, and LF line endings. Format changed files only;
  `npm run prettier` rewrites the entire repository.
  For `.mustache` templates, pass `--parser html` explicitly to Prettier.
- After product or image changes, run `npm run check`, then regenerate products
  and pages. After template-only changes, regenerate pages; generate products
  first if the required output is missing.
- After generator changes, also run the TypeScript check and exercise the affected
  generation steps. No automated browser test suite is configured.
- For visible changes, inspect the affected pages locally, including image links,
  category navigation, and mobile layout where relevant. Report checks actually
  performed and any verification limitations.

## Deployment

The GitHub Actions workflow runs on pushes to `main` and manual dispatch. It
installs dependencies, runs `transform`, `mustache`, and `build:image`, and publishes
`dist/bootstrap/` to the `gh-pages` branch with the domain `holzwerkskunst.de`.
The workflow currently does not run the image or TypeScript checks. A push to
`main` therefore triggers publication of the website.

Keep this file aligned with architectural and workflow changes. Put human-facing
setup and usage documentation in `README.md`.

## Image studio

- Users can explicitly save their own API key in browser Local Storage via the UI.
  Send it only in an Authorization header directly to `https://api.openai.com`.
  Validate and snapshot it per request. There are no backend routes or environment
  settings; never read or publish old `.env.image` files. Never embed
  credentials in public assets, URLs, API responses, error messages, or logs.
  Keep password inputs masked and empty after saving, support deletion and storage
  failures, and explain that browser storage is unencrypted and origin-specific.
- Use the official `openai` JavaScript SDK for Responses and image-edit requests.
  Keep `dangerouslyAllowBrowser: true` for the explicitly chosen browser-key flow,
  `maxRetries: 0` to avoid hidden attempts, logging off, and the API origin fixed.
  Pass cancellation signals and retain reported usage on SDK errors. Upload reference
  images as browser `File` objects through `client.images.edit`.
  esbuild bundles the SDK for static hosting without CDN imports or Node runtime
  dependencies. Publish its license alongside the bundle. `start:image` builds first
  and serves `dist/bootstrap/image/`; source `public/` contains a bare SDK import.
- Each image stays in one three-column row: original, editable product-image
  prompt, and result. New images get independent rows. The prompt column contains
  image-only analysis, text-only prompt improvement, output size, and generation.
- Prompts can be typed manually without analysis. Image/format changes require
  checking and editing, improving, or regenerating the prompt before generation.
  Both analysis and improvement replace the editable text only after success;
  preserve the previous prompt on errors/cancellation and account for both actions.
- Analysis must not trigger generation automatically. Only the explicit generate
  action sends the reviewed prompt and original image to the image-editing API.
- The result column also supports explicit follow-up edits: send the latest
  generated image and the entered refinement prompt to the same image-editing
  endpoint. Keep its output size and source revision; no fresh analysis is needed.
  Keep the prior result and prompt on failure/cancellation, and account for each
  refinement as a separate paid request in the existing cost history.
- Generate draft product-image prompts in German, regardless of the input language.
  Preserve names and product inscriptions in their original spelling and language;
  forward the reviewed prompt verbatim to generation.
- Source images and results stay in memory; adding products to the catalog is a
  separate manual task. Preserve uploads and prompts when showing request errors.
- Result downloads must be real JPEG files with a `.jpg` extension, at the
  generated pixel dimensions. Convert locally at 95% quality with white behind
  transparency. Keep the unmodified PNG for previews and subsequent API edits,
  and revoke both preview and download object URLs when replacing/removing results.
- Rotate/crop edits run locally in `public/image-editor.js`. Keep the initial
  upload for restoration and render edits from it. Apply edits to the reference
  used by both image API steps; mark prompts for review when the reference changes while
  retaining prior drafts, results, and costs. Check exported pixels and the
  cancel/reset paths in the browser when changing the editor.
- For API or state changes run `npm run test:image`; for UI changes also inspect
  the horizontal workflow, multiple rows, prompt review, and download in a browser.
- Tests must mock OpenAI rather than make billable calls. Report whether live API
  verification was possible; no API key is required to develop or test the app.
- Request costs are estimates from reported usage and versioned prices in
  `image-studio/public/costs.mjs`, converted with cached ECB rates from the public,
  CORS-enabled Frankfurter API. Send no credentials, prompts, or images to that API.
  Keep missing usage/rates and unsupported model prices visibly unknown. Retain
  known usage on failures; removing rows must not reduce session spending.
  Mock exchange-rate providers in tests and verify price changes against official docs.
