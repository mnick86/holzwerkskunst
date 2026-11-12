import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

export const jpegBytes = Uint8Array.from([255, 216, 255, 224, 0, 0]);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
export function browserFixture(t) {
  const dom = new JSDOM(html, {url: 'https://studio.example/image/', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  const {window} = dom;
  window.AbortController = AbortController;
  window.AbortSignal = AbortSignal;
  window.structuredClone = structuredClone;
  const urls = new Map();
  const revoked = [];
  let sequence = 0;
  window.URL.createObjectURL = (blob) => {
    const url = `blob:studio/${++sequence}`;
    urls.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = (url) => {
    revoked.push(url);
    urls.delete(url);
  };
  const dimensions = new WeakMap();
  window.createImageBitmap = async (file) => ({
    ...(dimensions.get(file) || {width: 1024, height: 768}),
    close() {},
  });
  const exports = [];
  window.HTMLCanvasElement.prototype.getContext = () => ({fillRect() {}, drawImage() {}});
  window.HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    exports.push({width: this.width, height: this.height, type, quality});
    queueMicrotask(() => callback(new Blob([jpegBytes], {type})));
  };
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  window.fetch = () => {
    throw new Error('Unmocked browser request');
  };
  const $ = (id) => window.document.getElementById(id);
  const file = (name, type = 'image/jpeg', width = 1024, height = 768) => {
    const result = new window.File([jpegBytes], name, {type});
    dimensions.set(result, {width, height});
    return result;
  };
  const selectFile = (input, image) => {
    Object.defineProperty(input, 'files', {configurable: true, value: [image]});
    input.dispatchEvent(new window.Event('change', {bubbles: true}));
  };
  return {window, document: window.document, $, urls, revoked, exports, file, selectFile};
}

// Execute the real browser controllers with injected API adapters; SDK contracts have separate tests.
export function loadController(window, filename, bindings = {}) {
  Object.assign(window, bindings);
  const source = readFileSync(new URL('../public/' + filename, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm, '')
    .replace(/^export /gm, '');
  window.eval(
    source + (filename === 'github-ui.js' ? '\nwindow.initGitHubUI = initGitHubUI;' : ''),
  );
}

export async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Browser controller did not settle');
}
