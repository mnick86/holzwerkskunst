import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/site.js', import.meta.url), 'utf8');

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
