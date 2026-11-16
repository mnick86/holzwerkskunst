import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';

const css = readFileSync(new URL('../src/site.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/site.js', import.meta.url), 'utf8');
const pages = ['index.html', 'produkt/holzscheiben/index.html'];
const controls = '[data-sort-control], [data-gallery-controls], [data-share]';

for (const page of pages) {
  test(`${page}: enhancements remain unavailable until their handlers initialize`, (t) => {
    const html = readFileSync(new URL('../dist/bootstrap/' + page, import.meta.url), 'utf8');
    const dom = new JSDOM(html, {
      url: 'https://holzwerkskunst.de/' + page,
      runScripts: 'outside-only',
    });
    t.after(() => dom.window.close());
    const {window} = dom;
    const {document} = window;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const elements = [...document.querySelectorAll(controls)];
    assert(elements.length > 0);

    // No JavaScript: keep the existing static catalog, real links and collapsed controls.
    assert(!document.documentElement.classList.contains('js'));
    for (const element of elements) {
      assert(element.hidden);
      assert.equal(window.getComputedStyle(element).display, 'none');
    }
    assert(document.querySelector('[data-contact]').href.startsWith('mailto:'));
    assert(document.querySelector('main a[href^="/produkt/"]'));

    // The early marker also covers a delayed, failed or blocked external script.
    const bootstrap = document.head.querySelector('script:not([src]):not([type])');
    assert(bootstrap, 'A synchronous enhancement marker is required before first paint');
    window.eval(bootstrap.textContent);
    assert(document.documentElement.classList.contains('js'));
    for (const element of elements) {
      assert(element.hidden, 'Do not enable a control before its handler is installed');
      const computed = window.getComputedStyle(element);
      assert.notEqual(computed.display, 'none', 'Keep the final control layout reserved');
      assert.equal(computed.visibility, 'hidden', 'Unavailable UI must stay invisible');
    }
    window.matchMedia = () => ({matches: true});
    window.eval(source);
    for (const element of elements) {
      assert(!element.hidden, 'Working enhancements become available after initialization');
      assert.equal(window.getComputedStyle(element).visibility, 'visible');
    }
  });
}

test('generated images and SVGs have intrinsic fallback dimensions, with CSS icon sizes retained', (t) => {
  for (const page of pages) {
    const dom = new JSDOM(
      readFileSync(new URL('../dist/bootstrap/' + page, import.meta.url), 'utf8'),
    );
    t.after(() => dom.window.close());
    const {document} = dom.window;
    for (const element of document.querySelectorAll('main img, .brand-logo, svg')) {
      assert(
        Number(element.getAttribute('width')) > 0,
        `${page}: missing width on ${element.outerHTML}`,
      );
      assert(
        Number(element.getAttribute('height')) > 0,
        `${page}: missing height on ${element.outerHTML}`,
      );
    }
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const icon = document.querySelector('.button .icon');
    assert(icon);
    assert.equal(dom.window.getComputedStyle(icon).width, '17px');
    assert.equal(dom.window.getComputedStyle(icon).height, '17px');
  }
});
