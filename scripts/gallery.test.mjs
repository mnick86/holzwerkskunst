import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import Handlebars from 'handlebars';

const source = readFileSync(new URL('../src/site.js', import.meta.url), 'utf8');
const h = Handlebars.create();
const canonical = 'https://holzwerkskunst.de/produkt/brotzeitbrettchen/';
const mailto =
  'mailto:mnick86@gmail.com?subject=' +
  encodeURIComponent('Anfrage: Brotzeitbrettchen') +
  '&body=' +
  encodeURIComponent(
    'Hallo Alexandra und Matthias,\n\nBrotzeitbrettchen\n' + canonical + '\n\nMeine Wünsche:\n',
  );
h.registerHelper('icon', () => '');
h.registerHelper('inquiryUrl', () => mailto);
h.registerHelper('imageNumber', (index) => index + 1);
const product = {
  id: 'brotzeitbrettchen',
  name: 'Brotzeitbrettchen',
  description: 'Ein persönliches Holzbrett.',
  tags: [],
  images: [10, 20, 30, 40, 50].map((id) => ({
    id: String(id),
    filename: `${id}.jpg`,
    small: `brotzeitbrettchen/${id}__400_300.webp`,
    large: `brotzeitbrettchen/${id}__1024_768.webp`,
    description: `Holzbrett mit Motiv ${id}`,
  })),
};
const html =
  `<link rel="canonical" href="${canonical}"><header><a href="${mailto}" data-contact>Kontakt</a></header>` +
  h.compile(readFileSync(new URL('../src/product.html.mustache', import.meta.url), 'utf8'))({
    product,
    hasGallery: true,
  }) +
  `<dialog id="contact-dialog"><p data-contact-context></p><a id="contact-email" href="${mailto}">E-Mail</a></dialog><p id="site-status"></p>`;
function fixture(t, fragment = '') {
  const dom = new JSDOM(html, {
    url: `https://preview.example/produkt/brotzeitbrettchen/${fragment}`,
    runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const {window} = dom;
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  const shared = [];
  window.navigator.share = async (value) => shared.push(value);
  const {document} = window;
  window.history.replaceState({preserve: 'existing state'}, '', window.location.href);
  window.eval(source);
  const selected = () => document.querySelector('[data-thumbnail][aria-current="true"]');
  const inquiry = () => new window.URL(document.querySelector('[data-product-inquiry]').href);
  const click = (selector) => document.querySelector(selector).click();
  return {window, document, selected, inquiry, click, shared};
}

test('image deep links restore the matching image, responsive sources, description and share URL', (t) => {
  const {document, selected, window} = fixture(t, '#20');
  assert.equal(selected().dataset.imageId, '20');
  const main = document.querySelector('[data-main-image]');
  assert(main.src.endsWith('/20__1024_768.webp'));
  assert(main.srcset.includes('/20__400_300.webp 400w'));
  assert.equal(main.alt, selected().dataset.description);
  assert.equal(window.location.hash, '#20');
  assert.equal(
    document.querySelector('[data-gallery]').dataset.shareUrl,
    'https://holzwerkskunst.de/produkt/brotzeitbrettchen/#20',
  );
  assert.equal(
    document.querySelector('[rel="canonical"]').href,
    'https://holzwerkskunst.de/produkt/brotzeitbrettchen/',
  );
});

test('thumbnail, keyboard, swipe and lightbox changes replace history while staying in sync', (t) => {
  const {document, window, selected, click} = fixture(t, '#20');
  const length = window.history.length;
  click('[data-thumbnail][data-image-id="10"]');
  assert.equal(window.location.hash, '#10');
  click('[data-gallery-controls] [data-next]');
  assert.equal(selected().dataset.imageId, '20');
  const gallery = document.querySelector('[data-gallery]');
  gallery.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
  assert.equal(window.location.hash, '#30');
  click('[data-enlarge]');
  click('[data-lightbox] [data-next]');
  assert.equal(window.location.hash, '#40');
  assert(document.querySelector('[data-lightbox-image]').src.endsWith('/40__1024_768.webp'));
  const surface = document.querySelector('.gallery-stage');
  const start = new window.Event('touchstart');
  Object.defineProperty(start, 'touches', {value: [{clientX: 300, clientY: 100}]});
  surface.dispatchEvent(start);
  const end = new window.Event('touchend');
  Object.defineProperty(end, 'changedTouches', {value: [{clientX: 100, clientY: 105}]});
  surface.dispatchEvent(end);
  assert.equal(window.location.hash, '#50');
  assert.equal(selected().dataset.imageId, '50');
  assert(document.querySelector('[data-lightbox-image]').src.endsWith('/50__1024_768.webp'));
  assert.equal(window.history.length, length);
  assert.equal(window.history.state.preserve, 'existing state');
});

for (const fragment of ['', '#unknown', '#%E0%A4%A', '#%3Cscript%3E']) {
  test(`missing or invalid fragment ${JSON.stringify(
    fragment,
  )} uses the first image safely`, (t) => {
    const {document, selected, window} = fixture(t, fragment);
    assert.equal(selected().dataset.imageId, '10');
    assert.equal(window.location.hash, fragment);
    assert(document.querySelector('[data-gallery]').dataset.shareUrl.endsWith('/#10'));
  });
}

test('hashchange and popstate restore selection, including encoded full filename stems', (t) => {
  const {document, window, selected, click} = fixture(t);
  const image = document.querySelector('[data-image-id="20"]');
  image.dataset.imageId = 'Motiv & Herz';
  window.history.replaceState(null, '', '#Motiv%20%26%20Herz');
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.equal(selected(), image);
  click('[data-gallery-controls] [data-next]');
  assert.equal(window.location.hash, '#30');
  window.history.replaceState(null, '', '#Motiv%20%26%20Herz');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  assert.equal(selected(), image);
  assert(document.querySelector('[data-gallery]').dataset.shareUrl.endsWith('#Motiv%20%26%20Herz'));
});

test('sharing and all product-page emails use the selection without filenames or direct-image lines', async (t) => {
  const {document, window, selected, click, shared} = fixture(t, '#40');
  click('[data-share]');
  await Promise.resolve();
  assert.equal(shared[0].url, 'https://holzwerkskunst.de/produkt/brotzeitbrettchen/#40');
  for (const link of document.querySelectorAll('a[href^="mailto:"]')) {
    const email = new window.URL(link.href);
    assert.equal(email.searchParams.get('subject'), 'Anfrage: Brotzeitbrettchen');
    const body = email.searchParams.get('body');
    assert(body.includes('https://holzwerkskunst.de/produkt/brotzeitbrettchen/#40'));
    assert(!body.includes('Ausgewähltes Bild:') && !body.includes('Bildlink:'));
    assert(!body.includes(selected().dataset.imageFilename));
    assert(!body.includes('__1024_768') && !email.search.includes('+'));
  }
  click('header [data-contact]');
  assert(document.querySelector('#contact-dialog').open);
  assert.equal(
    document.querySelector('[data-contact-context]').textContent,
    'Du interessierst dich für „Brotzeitbrettchen“?',
  );
  assert(
    new window.URL(document.querySelector('#contact-email').href).searchParams
      .get('body')
      .includes('/#40'),
  );
  document.querySelector('#contact-dialog').close();
  click('[data-thumbnail][data-image-id="10"]');
  click('[data-share]');
  await Promise.resolve();
  assert(shared.at(-1).url.endsWith('/#10'));
  assert(
    !new window.URL(document.querySelector('#contact-email').href).searchParams
      .get('body')
      .includes('/#40'),
  );
});

test('copy-link fallback keeps the selected image when native sharing is unavailable', async (t) => {
  const {window, click} = fixture(t, '#20');
  window.navigator.share = undefined;
  let copied;
  Object.defineProperty(window.navigator, 'clipboard', {
    value: {
      writeText: async (url) => {
        copied = url;
      },
    },
  });
  click('[data-share]');
  await Promise.resolve();
  assert.equal(copied, 'https://holzwerkskunst.de/produkt/brotzeitbrettchen/#20');
});
