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
  assert(hero.includes('.webp'));
  assert(!hero.includes('.jpg'));
  assert(!hero.includes('hero-werkstatt.png'));
  assert(hero.includes('fetchpriority="high"'));
  const original = readFileSync(new URL('../src/assets/werkstatt.png', import.meta.url));
  const srcsets = [...hero.matchAll(/srcset="([^"]+)"/g)];
  assert.equal(srcsets.length, 1, 'Responsive WebP images');
  for (const [, srcset] of srcsets) {
    const widths = [];
    for (const candidate of srcset.split(',')) {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      const image = readFileSync(new URL('../dist/bootstrap' + url, import.meta.url));
      const metadata = sizeOf(image);
      assert.equal(metadata.type, 'webp');
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
  const productsWithInquiry = new Set();
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
        assert(body.includes(`https://holzwerkskunst.de/produkt/${product.id}/`), page);
        productsWithInquiry.add(product.id);
        specific++;
      }
    }
  }
  assert(general > 0);
  assert.equal(productsWithInquiry.size, products.length);
  assert(specific >= products.length, 'Every product needs at least one contextual inquiry link');
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

test('gallery selection changes responsive sources together and keeps the lightbox full resolution', () => {
  const events = new Map();
  const node = (name) => ({
    addEventListener: (type, callback) => events.set(`${name}:${type}`, callback),
    setAttribute() {},
    removeAttribute(attribute) {
      delete this[attribute];
    },
  });
  const main = {
    ...node('main'),
    src: '/first-large.jpg',
    srcset: '/first-small.jpg 400w, /first-large.jpg 1024w',
  };
  const enlarge = node('enlarge');
  const fullImage = node('fullImage');
  const counter = {};
  const lightbox = {
    open: false,
    showModal() {
      this.open = true;
    },
    querySelector: () => counter,
  };
  const thumbnails = [
    {...node('first'), dataset: {small: '/first-small.jpg', large: '/first-large.jpg'}},
    {
      ...node('second'),
      dataset: {
        small: '/second-small.jpg',
        large: '/second-large.jpg',
        description: 'Holzbrett mit graviertem Feuerwehrmotiv und dem Namen Valentin',
      },
    },
    {...node('legacy'), dataset: {large: '/legacy-large.jpg'}},
  ];
  const nodes = {
    '[data-main-image]': main,
    '[data-enlarge]': enlarge,
    '[data-lightbox]': lightbox,
    '[data-lightbox-image]': fullImage,
    '[data-gallery-controls]': null,
    '.gallery-stage': node('stage'),
  };
  const gallery = {
    ...node('gallery'),
    getAttribute: () => 'Bildergalerie: Holzprodukt',
    querySelector: (selector) => nodes[selector],
    querySelectorAll: (selector) => (selector === '[data-thumbnail]' ? thumbnails : []),
  };
  const document = {
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-gallery]' ? [gallery] : []),
    addEventListener() {},
  };
  vm.runInNewContext(source, {
    document,
    window: {
      location: {hash: ''},
      addEventListener: (type, callback) => events.set(`window:${type}`, callback),
    },
  });
  const click = {preventDefault() {}};
  events.get('second:click')(click);
  assert.equal(main.src, '/second-large.jpg');
  assert.equal(main.srcset, '/second-small.jpg 400w, /second-large.jpg 1024w');
  assert.equal(enlarge.href, '/second-large.jpg');
  assert.equal(main.alt, thumbnails[1].dataset.description);
  events.get('enlarge:click')(click);
  assert(lightbox.open);
  assert.equal(fullImage.src, '/second-large.jpg');
  assert.equal(fullImage.alt, thumbnails[1].dataset.description);
  events.get('gallery:keydown')({key: 'ArrowLeft', preventDefault() {}});
  assert.equal(main.srcset, '/first-small.jpg 400w, /first-large.jpg 1024w');
  assert.equal(fullImage.src, '/first-large.jpg');
  events.get('legacy:click')(click);
  assert.equal(main.src, '/legacy-large.jpg');
  assert.equal(main.alt, 'Holzprodukt');
  assert.equal(main.srcset, undefined, 'Older markup must not keep the previously selected source');
});
