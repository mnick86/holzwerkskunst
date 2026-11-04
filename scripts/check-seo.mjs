import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sizeOf from 'image-size';

// Audit the exact deliverable after mustache + build:image, never just templates.
const root = path.resolve('dist/bootstrap');
const origin = 'https://holzwerkskunst.de';
const products = JSON.parse(fs.readFileSync(path.join(root, 'produkt/products.json'), 'utf8'));
const tags = [...new Set(products.flatMap((product) => product.tags))];
const pages = [
  'index.html',
  'ueber-uns.html',
  'impressum.html',
  'datenschutz.html',
  '404.html',
  'image/index.html',
  ...products.map((product) => `produkt/${product.id}/index.html`),
  ...tags.map((tag) => `kategorie/${tag}.html`),
];
const decode = (text) =>
  text.replace(/&(amp|quot|apos|lt|gt|#x[\da-f]+|#\d+);/gi, (match, name) => {
    if (name.startsWith('#'))
      return String.fromCodePoint(
        Number.parseInt(
          name.slice(name[1].toLowerCase() === 'x' ? 2 : 1),
          name[1].toLowerCase() === 'x' ? 16 : 10,
        ),
      );
    return {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>'}[name.toLowerCase()];
  });
const attributes = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]),
  );
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const expectedUrl = (page) =>
  origin +
  '/' +
  page
    .split('/')
    .map(encodeURIComponent)
    .join('/')
    .replace(/(^|\/)index\.html$/, '$1');
const localFile = (href) => {
  const url = new URL(href);
  assert.equal(url.origin, origin, `Unexpected origin: ${href}`);
  assert.equal(url.protocol, 'https:');
  const filename = path.join(root, decodeURIComponent(url.pathname));
  assert(fs.existsSync(filename), `Missing target: ${href}`);
  if (fs.statSync(filename).isDirectory())
    assert(fs.existsSync(path.join(filename, 'index.html')), href);
  return filename;
};
const indexable = new Set();
const descriptions = new Set();
const titles = new Set();
let structuredPages = 0;
let categoryCards = 0;
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const metas = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attributes(tag));
  const meta = (name) => {
    const matches = metas.filter((item) => item.name === name || item.property === name);
    assert.equal(matches.length, 1, `${page}: exactly one ${name}`);
    return matches[0].content;
  };
  const canonicals = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => attributes(tag))
    .filter((item) => item.rel === 'canonical');
  assert.equal(canonicals.length, 1, `${page}: canonical required`);
  const canonical = canonicals[0].href;
  assert.equal(canonical, expectedUrl(page), `${page}: canonical domain/path mismatch`);
  localFile(canonical);
  assert(!/[?#]/.test(canonical), `${page}: canonical contains parameters`);
  const robots = meta('robots');
  if (['404.html', 'image/index.html'].includes(page)) {
    assert(/\bnoindex\b/.test(robots), `${page}: must not be indexed`);
    continue;
  }
  assert(!/\bnoindex\b/.test(robots), `${page}: accidentally excluded`);
  assert(robots.includes('max-image-preview:large'), page);
  indexable.add(canonical);
  const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] || '');
  assert(title && !titles.has(title), `${page}: missing or duplicate title`);
  titles.add(title);
  const description = meta('description');
  assert(description && description.length <= 160, `${page}: missing or overlong description`);
  assert.equal(description, normalize(description), page);
  assert(!descriptions.has(description), `${page}: duplicate description`);
  descriptions.add(description);
  assert.equal(meta('og:url'), canonical);
  assert.equal(meta('og:title'), title);
  assert.equal(meta('og:description'), description);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:title'), title);
  assert.equal(meta('twitter:description'), description);
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.equal(meta('twitter:image:alt'), meta('og:image:alt'));
  assert(meta('og:image:alt').length > 0, page);
  const dimensions = sizeOf(localFile(meta('og:image')));
  assert.equal(Number(meta('og:image:width')), dimensions.width, `${page}: image width`);
  assert.equal(Number(meta('og:image:height')), dimensions.height, `${page}: image height`);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, `${page}: structured data required`);
  const data = JSON.parse(scripts[0][1]);
  assert.equal(data['@context'], 'https://schema.org');
  const graph = data['@graph'];
  assert(
    graph.some((item) => item['@type'] === 'WebSite' && item.url === origin + '/'),
    page,
  );
  const organization = graph.find((item) => item['@type'] === 'Organization');
  assert.equal(organization.name, 'Holzwerkskunst');
  assert(!organization.address, `${page}: unverified address must not be introduced`);
  localFile(organization.logo);
  const webPage = graph.find((item) => item.url === canonical && /Page$/.test(item['@type']));
  assert(webPage && webPage.name === title && webPage.description === description, page);
  assert.equal(webPage.inLanguage, 'de-DE');
  structuredPages++;
  if (page.startsWith('produkt/')) {
    const product = products.find((item) => page === `produkt/${item.id}/index.html`);
    assert(
      normalize(decode(html)).includes(normalize(product.description)),
      `${page}: full product description lost`,
    );
    const crumbs = graph.find((item) => item['@type'] === 'BreadcrumbList');
    assert.equal(crumbs.itemListElement.at(-1).item, canonical);
    assert.equal(crumbs.itemListElement.at(-1).name, product.name);
    assert(/data-main-image[\s\S]*?srcset=/.test(html), `${page}: responsive main image`);
  }
  if (page === 'index.html' || page.startsWith('kategorie/')) {
    const selectedTag =
      page === 'index.html' ? null : page.slice('kategorie/'.length, -'.html'.length);
    const selection = products.filter(
      (product) => !selectedTag || product.tags.includes(selectedTag),
    );
    const cards = [...html.matchAll(/<article\b[^>]*data-product\b[\s\S]*?<\/article>/g)];
    assert.equal(cards.length, selection.length, `${page}: unrelated or missing products`);
    assert(
      !html.includes('class="product-card catalog-hidden"'),
      `${page}: hidden unrelated products`,
    );
    const links = cards.map(([card]) => decode(card.match(/href="([^"]+)"/)[1]));
    assert.deepEqual(
      new Set(links),
      new Set(selection.map((product) => `/produkt/${product.id}/`)),
      page,
    );
    const list = graph.find((item) => item['@type'] === 'ItemList');
    assert.equal(list.numberOfItems, selection.length, page);
    assert.deepEqual(
      new Set(list.itemListElement.map((item) => item.item)),
      new Set(links.map((href) => new URL(href, origin).href)),
      page,
    );
    if (selectedTag) {
      categoryCards += cards.length;
      for (const [card] of cards.slice(0, 2))
        assert(card.includes('loading="eager"'), `${page}: visible cards lazy-loaded`);
    }
  }
}

const xml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert(xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
assert(!/<lastmod>|<priority>|<changefreq>/.test(xml), 'Do not invent update dates or priorities');
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)];
const sitemap = new Map();
let imageEntries = 0;
for (const [, block] of entries) {
  const url = decode(block.match(/<loc>([^<]+)<\/loc>/)[1]);
  assert(!sitemap.has(url), `Duplicate sitemap URL: ${url}`);
  localFile(url);
  const images = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(([, value]) =>
    decode(value),
  );
  for (const image of images) {
    localFile(image);
    imageEntries++;
  }
  sitemap.set(url, images);
}
assert.deepEqual(
  new Set(sitemap.keys()),
  indexable,
  'Sitemap must cover exactly the canonical indexable pages',
);
for (const product of products) {
  const images = sitemap.get(new URL(`/produkt/${product.id}/`, origin).href);
  assert.deepEqual(
    new Set(images),
    new Set(product.images.map((image) => new URL('/produkt/' + image.large, origin).href)),
    `Sitemap omits gallery images: ${product.id}`,
  );
}
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
assert(
  !/^Disallow:\s*\/(?:\s|$|image)/im.test(robots),
  'Allow crawlers to read noindex directives',
);
console.log(
  `SEO verified: ${pages.length} pages, ${indexable.size} sitemap URLs, ${structuredPages} JSON-LD graphs, ${imageEntries} image entries, ${categoryCards} relevant category cards. Canonicals, metadata, images and source content are consistent.`,
);
