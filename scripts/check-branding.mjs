import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sizeOf from 'image-size';

const root = path.resolve('dist/bootstrap');
const version = createHash('sha256')
  .update(fs.readFileSync('src/assets/logo.png'))
  .digest('hex')
  .slice(0, 12);
const pages = fs
  .readdirSync(root, {recursive: true})
  .filter((file) => String(file).endsWith('.html'));
assert(pages.length > 0, 'Generate the site before checking branding');
let logos = 0;
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const pageUrl = new URL(
    '/' + String(file).replaceAll(path.sep, '/'),
    'https://holzwerkskunst.de',
  );
  assert(
    !/brand-mark|__LOGO_VERSION__|favicon\.svg|M5 23C10 17 10 9 19 1/.test(html),
    `Old logo or unresolved branding in ${file}`,
  );
  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  assert(header?.includes('class="brand-logo"'), `Missing header logo: ${file}`);
  if (!pageUrl.pathname.startsWith('/image/')) {
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
    assert(footer?.includes('class="brand-logo"'), `Missing footer logo: ${file}`);
  }
  for (const match of html.matchAll(/<img\b[^>]*class="(?:brand-logo|about-brand-logo)"[^>]*>/g)) {
    const src = match[0].match(/src="([^"]+)"/)?.[1];
    assert(src, `Missing logo URL in ${file}`);
    const url = new URL(src, pageUrl);
    assert.equal(url.searchParams.get('v'), version, `Outdated logo version in ${file}`);
    const image = path.join(root, decodeURIComponent(url.pathname));
    const dimensions = sizeOf(image);
    const expectedSize = match[0].includes('class="about-brand-logo"') ? 288 : 144;
    assert.equal(dimensions.width, expectedSize, `Wrong logo width in ${file}`);
    assert.equal(dimensions.height, expectedSize, `Wrong logo height in ${file}`);
    logos++;
  }
  const iconTag = html.match(/<link\b[^>]*rel="icon"[^>]*>/)?.[0];
  assert(iconTag, `Missing favicon: ${file}`);
  const favicon = new URL(iconTag.match(/href="([^"]+)"/)[1], pageUrl);
  assert.equal(favicon.searchParams.get('v'), version, `Outdated favicon in ${file}`);
  const dimensions = sizeOf(path.join(root, decodeURIComponent(favicon.pathname)));
  assert.equal(dimensions.width, 48, `Wrong favicon width in ${file}`);
  assert.equal(dimensions.height, 48, `Wrong favicon height in ${file}`);
}
assert(
  fs
    .readFileSync(path.join(root, 'assets/logo.png'))
    .equals(fs.readFileSync(path.join(root, 'image/logo.png'))),
  'Catalog and image studio must use the same logo',
);
console.log(
  `Branding verified on all ${pages.length} HTML pages: ${logos} logo instances, current favicons, no old logo markup.`,
);
