import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import sizeOf from 'image-size';

test('hero serves compressed responsive images with matching width descriptors', async () => {
  const html = readFileSync(new URL('../dist/bootstrap/index.html', import.meta.url), 'utf8');
  const hero = html.match(/<figure class="hero-visual">[\s\S]*?<\/figure>/)?.[0];
  assert(hero?.includes('srcset='));
  assert(!hero.includes('.webp'));
  assert(!hero.includes('hero-werkstatt.png'));
  assert(hero.includes('fetchpriority="high"'));
  const original = readFileSync(new URL('../src/assets/werkstatt.png', import.meta.url));
  const srcsets = [...hero.matchAll(/srcset="([^"]+)"/g)];
  assert.equal(srcsets.length, 1, 'Responsive JPEG images');
  for (const [, srcset] of srcsets) {
    const widths = [];
    for (const candidate of srcset.split(',')) {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      const image = readFileSync(new URL('../dist/bootstrap' + url, import.meta.url));
      const metadata = sizeOf(image);
      assert.equal(metadata.type, 'jpg');
      const width = Number.parseInt(descriptor, 10);
      widths.push(width);
      assert.equal(metadata.width, width);
      assert(Math.abs(metadata.height - (width * 941) / 1672) <= 1);
      assert(image.length < original.length * 0.2, 'Hero variants must be materially smaller');
    }
    assert.deepEqual(widths, [480, 768, 1024, 1440]);
  }
});

const source = readFileSync(new URL('../src/site.js', import.meta.url), 'utf8');

test('general contact and product inquiries contain the correct email subject and body', () => {
  const products = JSON.parse(
    readFileSync(new URL('../dist/bootstrap/produkt/products.json', import.meta.url), 'utf8'),
  );
  const pages = [
    ['index.html'],
    ['ueber-uns.html'],
    ...products.map((product) => [`produkt/${product.id}/index.html`, product]),
  ];
  let general = 0;
  let specific = 0;
  for (const [page, product] of pages) {
    const html = readFileSync(new URL('../dist/bootstrap/' + page, import.meta.url), 'utf8');
    for (const [, encoded] of html.matchAll(/href="(mailto:[^"]+)"/g)) {
      const href = encoded.replaceAll('&amp;', '&').replaceAll('&#x3D;', '=');
      const url = new URL(href);
      if (!url.searchParams.has('subject')) continue;
      const subject = url.searchParams.get('subject');
      const body = url.searchParams.get('body');
      assert(!subject.includes('inquiryUrl'), page);
      assert(!body.includes('inquiryUrl') && !body.includes('undefined'), page);
      assert(body.startsWith('Hallo Alexandra und Matthias,'), page);
      if (subject === 'Meine individuelle Geschenkidee') {
        assert(!body.includes('/produkt/'), page);
        general++;
      } else {
        assert(product, page);
        assert.equal(subject, `Anfrage: ${product.name}`);
        assert(body.includes(`https://www.holzwerkskunst.de/produkt/${product.id}/`), page);
        specific++;
      }
    }
  }
  assert(general > 0);
  assert.equal(specific, products.length);
});

test('incomplete and older catalog markup leaves static navigation usable', () => {
  const required = [
    '[data-product-grid]',
    '[name="sort"]',
    '[data-result-count]',
    '[data-empty]',
    '[data-sort-control]',
  ];
  for (const missing of required) {
    const catalog = {
      querySelector(selector) {
        return selector === missing ? null : {};
      },
    };
    const document = {
      querySelector: () => null,
      querySelectorAll: (selector) => (selector === '[data-catalog]' ? [catalog] : []),
      addEventListener() {},
    };
    assert.doesNotThrow(() => vm.runInNewContext(source, {document, window: {}}), missing);
  }
});

test('generated pages reference the current CSS and JavaScript content hashes', () => {
  const html = readFileSync(new URL('../dist/bootstrap/index.html', import.meta.url), 'utf8');
  for (const extension of ['css', 'js']) {
    const hash = createHash('sha256')
      .update(readFileSync(new URL(`../src/site.${extension}`, import.meta.url)))
      .digest('hex')
      .slice(0, 12);
    assert(html.includes(`/assets/site.${extension}?v=${hash}`));
  }
});

test('category path wins over legacy tag parameters, including when sorting', () => {
  const location = {href: 'http://localhost:4200/kategorie/Geschenk.html?tag=Hochzeit&q=alt'};
  const history = {
    replaceState: (_, __, url) => {
      location.href = String(url);
    },
    pushState: (_, __, url) => {
      location.href = String(url);
    },
  };
  const makeItem = (name, tags) => ({
    dataset: {name, tags: JSON.stringify(tags), created: '2024-01-01'},
    classList: {contains: () => false, remove() {}},
    hidden: false,
  });
  const items = [makeItem('Geschenk', ['Geschenk']), makeItem('Hochzeit', ['Hochzeit'])];
  const sortEvents = {};
  const sort = {
    options: [{value: 'default'}, {value: 'newest'}],
    value: 'default',
    addEventListener: (type, callback) => {
      sortEvents[type] = callback;
    },
  };
  const nodes = {
    '[data-product-grid]': {querySelectorAll: () => items, append() {}},
    '[name="sort"]': sort,
    '[data-result-count]': {},
    '[data-empty]': {},
    '[data-sort-control]': {},
  };
  const catalog = {
    dataset: {initialTag: 'Geschenk'},
    querySelector: (selector) => nodes[selector],
    querySelectorAll: () => {
      throw new Error('Category links must not be intercepted');
    },
  };
  const document = {
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-catalog]' ? [catalog] : []),
    addEventListener() {},
  };
  vm.runInNewContext(source, {document, window: {addEventListener() {}}, location, history, URL});
  assert.equal(location.href, 'http://localhost:4200/kategorie/Geschenk.html');
  assert.equal(items[0].hidden, false);
  assert.equal(items[1].hidden, true);
  sort.value = 'newest';
  sortEvents['change']();
  assert.equal(location.href, 'http://localhost:4200/kategorie/Geschenk.html?sort=newest');
  assert.equal(new URL(location.href).searchParams.has('tag'), false);
});
