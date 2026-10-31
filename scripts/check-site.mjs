import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// Run after transform + mustache. This audits the actual static deliverable.
const root = path.resolve('dist/bootstrap');
const products = JSON.parse(fs.readFileSync(path.join(root, 'produkt/products.json'), 'utf8'));
const tags = [...new Set(products.flatMap((product) => product.tags))];
const ids = new Set(products.map((product) => product.id));
assert.equal(ids.size, products.length, 'Product IDs must remain unique');
const sources = fs
  .readdirSync('products', {withFileTypes: true})
  .filter((entry) => entry.isDirectory());
assert.equal(products.length, sources.length, 'Every source product must appear in the catalog');
let images = 0;
for (const folder of sources) {
  const directory = path.join('products', folder.name);
  const spec = YAML.parse(fs.readFileSync(path.join(directory, 'spec.yaml'), 'utf8'));
  const product = products.find((candidate) => candidate.id === spec.id);
  assert(product, `Product URL missing: ${spec.id}`);
  for (const key of ['name', 'description', 'tags']) {
    assert.deepEqual(product[key], spec[key], `Source content changed: ${spec.id}/${key}`);
  }
  assert.equal(product.created, spec.date, `Source date changed: ${spec.id}`);
  const sourceImages = fs.readdirSync(directory).filter((file) => /\.(jpg|jpeg|png)$/i.test(file));
  assert.equal(product.images.length, sourceImages.length, `Images omitted: ${spec.id}`);
  const html = fs.readFileSync(path.join(root, `produkt/${spec.id}/index.html`), 'utf8');
  for (const image of product.images) {
    for (const size of ['small', 'large']) {
      assert(
        fs.existsSync(path.join(root, 'produkt', image[size])),
        `Missing image: ${image[size]}`,
      );
      assert(html.includes(image[size]), `Gallery image omitted: ${image[size]}`);
      images++;
    }
  }
}
const pages = [
  'index.html',
  'ueber-uns.html',
  'impressum.html',
  'datenschutz.html',
  '404.html',
  ...products.map((product) => `produkt/${product.id}/index.html`),
  ...tags.map((tag) => `kategorie/${tag}.html`),
];
let links = 0;
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `Exactly one h1 required: ${page}`);
  assert(!html.includes('{{'), `Unrendered template: ${page}`);
  assert(/<title>[^<]+<\/title>/.test(html), `Missing page title: ${page}`);
  assert(/<meta name="description" content="[^"]+"/.test(html), `Missing description: ${page}`);
  assert(!/type="search"|role="search"/.test(html), `Search must be absent: ${page}`);
  for (const card of html.matchAll(/<article\b[^>]*data-product\b[\s\S]*?<\/article>/g)) {
    assert(
      !/class="(?:tags|tag|product-excerpt)|<p[ >]|<button[ >]/.test(card[0]),
      `Extra product card information in ${page}`,
    );
    assert.equal((card[0].match(/<a\b/g) || []).length, 1, `One full-card link required: ${page}`);
  }
  for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[^\"]*)?"/g)) {
    assert(
      fs.existsSync(path.join(root, decodeURIComponent(match[1]))),
      `Broken link in ${page}: ${match[1]}`,
    );
    links++;
  }
  for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const candidate of match[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      assert(
        fs.existsSync(path.join(root, decodeURIComponent(url))),
        `Broken responsive image in ${page}: ${url}`,
      );
    }
  }
  for (const resource of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(https?:[^\"]+)"/g)) {
    if (!resource[0].includes('canonical'))
      assert.fail(`Unexpected external dependency: ${resource[1]}`);
  }
}
console.log(
  `Catalog verified: ${products.length} products, ${tags.length} categories, ${pages.length} pages, ${images} image variants, ${links} local links. Source content and public product URLs preserved.`,
);
