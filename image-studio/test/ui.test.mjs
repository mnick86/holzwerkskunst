import assert from 'node:assert/strict';
import test from 'node:test';
import {createGitHubFixture} from './github-fixture.mjs';
import * as github from '../public/github.mjs';
import {StudioError} from '../public/openai.mjs';
import {browserFixture, jpegBytes, loadController, until} from './dom-fixture.mjs';

function githubUI(t, describeImage = async () => 'Holzbrett mit persönlicher Gravur.') {
  const dom = browserFixture(t);
  const mock = createGitHubFixture();
  mock.refs.set('feature/bilder', 'c0');
  let service;
  const descriptions = [];
  loadController(dom.window, 'github-ui.js', {
    ...github,
    StudioError,
    createGitHubClient: (options) => {
      service = github.createGitHubClient({
        ...options,
        fetchImpl: mock.fetch,
        getDimensions: async () => ({width: 1024, height: 768}),
      });
      return service;
    },
  });
  const element = dom.document
    .querySelector('#image-row-template')
    .content.firstElementChild.cloneNode(true);
  dom.$('image-rows').append(element);
  const row = {
    element,
    result: 'blob:result',
    resultJpeg: new Blob([jpegBytes], {type: 'image/jpeg'}),
    resultSize: '1024x768',
    imageRevision: 0,
    resultImageRevision: 0,
  };
  const ui = dom.window.initGitHubUI({
    getRows: () => [row],
    onRowUpdate: (value) => ui.updateRow(value),
    describeImage: async (...args) => {
      descriptions.push(args);
      return describeImage(...args);
    },
  });
  ui.registerRow(row);
  const connect = async () => {
    dom.$('github-token').value = 'test-only-placeholder';
    dom.$('github-token-form').requestSubmit();
    assert.equal(dom.$('github-token').value, '');
    dom.$('github-connect').click();
    await until(() => service.getState().connected && !service.getState().busy);
    dom.$('github-branch').value = 'feature/bilder';
    dom.$('github-branch').dispatchEvent(new dom.window.Event('change'));
    await until(
      () => !service.getState().busy && service.getState().session?.branch === 'feature/bilder',
    );
  };
  const choose = async () => {
    dom.$('github-product-select').value = 'brotzeitbrettchen';
    dom.$('github-product-select').dispatchEvent(new dom.window.Event('change'));
    await until(() => !dom.$('github-image-form').querySelector('[type="submit"]').disabled);
    await until(
      () => dom.$('github-image-previews').querySelectorAll('img:not([hidden])').length > 0,
    );
  };
  return {...dom, mock, service, row, descriptions, connect, choose};
}

test('GitHub connection is green and the initially empty upload dialog makes no data/API requests', async (t) => {
  const f = githubUI(t);
  await f.connect();
  assert(f.$('github-connect').classList.contains('button-primary'));
  assert.equal(f.$('github-connect').textContent, 'Mit GitHub verbunden');
  assert.equal(f.mock.calls.filter((c) => c.route.startsWith('/git/blobs/')).length, 0);
  const calls = f.mock.calls.length;
  f.row.element.querySelector('.github-add').click();
  assert(f.$('github-image-dialog').open);
  assert.equal(f.$('github-product-select').value, '');
  assert.equal(f.mock.calls.length, calls);
  assert.equal(f.descriptions.length, 0);
  assert.equal(f.$('github-image-previews').children.length, 0);
  assert(f.$('github-image-form').querySelector('[type="submit"]').disabled);
  assert.equal(
    f.$('github-product-select').options.length,
    2,
    'Folder names come from the branch tree',
  );
  f.$('github-token-delete').click();
  assert(!f.$('github-connect').classList.contains('button-primary'));
  assert.equal(f.$('github-connect').textContent, 'Mit GitHub verbinden');
});

test('selection loads branch previews and an editable description; upload, refresh and reopening retain the new image', async (t) => {
  const f = githubUI(t);
  await f.connect();
  f.row.element.querySelector('.github-add').click();
  await f.choose();
  assert.equal(f.descriptions.length, 1);
  assert.equal(f.$('github-image-description').value, 'Holzbrett mit persönlicher Gravur.');
  assert.equal(f.$('github-image-name').value, '20.jpg');
  f.$('github-image-name').value = '50.jpg';
  f.$('github-image-description').value = 'Mein bearbeiteter Bildtext.';
  f.$('github-image-description').dispatchEvent(new f.window.Event('input'));
  f.$('github-image-form').requestSubmit();
  await until(() => !f.$('github-image-dialog').open && !f.row.githubBusy);
  assert.equal(f.$('github-publish').disabled, false);
  assert(f.$('github-publish').textContent.includes('1 Commit'));
  const sidecar = f.mock.calls.find(
    (c) => c.method === 'POST' && c.body.content?.includes('Mein bearbeiteter Bildtext.'),
  );
  assert(sidecar && !sidecar.body.content.includes('id:'));
  const calls = f.mock.calls.length;
  f.row.element.querySelector('.github-add').click();
  assert.equal(f.$('github-product-select').value, '');
  assert.equal(f.mock.calls.length, calls);
  await f.choose();
  assert.equal(f.descriptions.length, 1, 'Reopening reuses the edited draft without a paid call');
  assert.equal(f.$('github-image-description').value, 'Mein bearbeiteter Bildtext.');
  assert.deepEqual(
    [...f.$('github-image-previews').querySelectorAll('figcaption')].map((n) => n.textContent),
    ['10.jpg', '50.jpg'],
  );
  assert(f.$('github-gallery-note').textContent.includes('feature/bilder'));
  assert.equal(f.$('github-image-name').value, '60.jpg');
  f.$('github-image-dialog').close();
  f.$('github-refresh').click();
  await until(() => !f.service.getState().busy);
  assert(f.$('github-publish').textContent.includes('1 Commit'));
  f.$('github-publish').click();
  await until(() => f.service.getState().session?.merged && !f.service.getState().busy);
  assert(f.$('github-publish').disabled);
  assert(![...f.$('github-branch').options].some((o) => o.value === 'feature/bilder'));
  assert(f.$('github-message').textContent.includes('gelöscht'));
});

test('new product dialog rejects unknown tags and recovers when a listed tag is entered', async (t) => {
  const f = githubUI(t);
  await f.connect();
  f.row.element.querySelector('.github-add').click();
  f.$('github-new-product').click();
  await until(() => f.$('github-product-dialog').open);
  f.$('github-product-name').value = 'Meine Laterne';
  f.$('github-product-id').value = 'meine-laterne';
  f.$('github-product-description').value = 'Eine persönliche Laterne.';
  f.$('github-product-tags').value = 'Geschenk, NichtVorhanden';
  f.$('github-product-tags').dispatchEvent(new f.window.Event('input'));
  assert(!f.$('github-product-tags').checkValidity());
  assert(f.$('github-product-tags-error').textContent.includes('NichtVorhanden'));
  f.$('github-product-form').requestSubmit();
  assert.equal(f.service.getState().session.drafts.length, 0);
  f.$('github-product-tags').value = 'Geschenk, Geburtstag';
  f.$('github-product-tags').dispatchEvent(new f.window.Event('input'));
  assert(f.$('github-product-tags').checkValidity());
  f.$('github-product-form').requestSubmit();
  await until(() => !f.$('github-product-dialog').open);
  assert.equal(f.service.getState().session.drafts[0].id, 'meine-laterne');
  assert.equal(f.$('github-product-select').value, 'meine-laterne');
  assert(
    !f.mock.calls.some((c) => c.method === 'POST'),
    'Preparing a product writes nothing remotely',
  );
});

test('description failure allows manual entry and never writes an image automatically', async (t) => {
  const f = githubUI(t, async () => {
    throw new StudioError(503, 'Beschreibung nicht verfügbar.');
  });
  await f.connect();
  f.row.element.querySelector('.github-add').click();
  await f.choose();
  assert.equal(f.$('github-image-description').readOnly, false);
  assert(
    f
      .$('github-image-dialog')
      .querySelector('.github-dialog-error')
      .textContent.includes('Beschreibung nicht verfügbar'),
  );
  assert(!f.mock.calls.some((c) => c.method !== 'GET'));
  f.$('github-image-description').value = 'Manuelle Beschreibung.';
  f.$('github-image-form').requestSubmit();
  await until(() => !f.$('github-image-dialog').open);
  assert.equal(f.mock.prs.size, 1);
});

test('closing the upload dialog cancels analysis and late results cannot overwrite a new draft', async (t) => {
  let finish;
  const f = githubUI(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await f.connect();
  f.row.element.querySelector('.github-add').click();
  f.$('github-product-select').value = 'brotzeitbrettchen';
  f.$('github-product-select').dispatchEvent(new f.window.Event('change'));
  await until(() => f.descriptions.length === 1);
  const signal = f.descriptions[0][2];
  f.$('github-image-dialog').close();
  assert(signal.aborted);
  f.row.element.querySelector('.github-add').click();
  f.$('github-image-description').value = 'Mein neuer Entwurf.';
  f.$('github-image-description').dispatchEvent(new f.window.Event('input'));
  finish('Veraltetes Ergebnis.');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.$('github-image-description').value, 'Mein neuer Entwurf.');
  assert.equal(f.$('github-image-description').readOnly, false);
  assert.equal(f.descriptions.length, 1);
  assert(!f.mock.calls.some((c) => c.method !== 'GET'));
});

test('a blocked credential store leaves the token unsaved and never connects', (t) => {
  const f = githubUI(t);
  Object.defineProperty(f.window, 'localStorage', {
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error('Storage disabled');
      },
    },
  });
  f.$('github-token').value = 'test-only-placeholder';
  f.$('github-token-form').requestSubmit();
  assert.equal(f.$('github-token').type, 'password');
  assert(f.$('github-message').textContent.includes('konnte nicht'));
  assert(f.$('github-connect').disabled);
  assert.equal(f.mock.calls.length, 0);
  assert(!f.$('github-message').textContent.includes('test-only-placeholder'));
});

function studioUI(t, client) {
  const f = browserFixture(t);
  const rows = [];
  const requests = [];
  loadController(f.window, 'studio.js', {
    StudioError,
    createOpenAIClient: () =>
      client ||
      new Proxy(
        {},
        {
          get: (_, name) => async () => {
            requests.push(name);
            throw new Error('No API request expected');
          },
        },
      ),
    createImageEditor: () => ({open: async () => null}),
    initGitHubUI: () => ({updateRow() {}, registerRow: (row) => rows.push(row)}),
  });
  return {...f, rows, requests};
}

test('clicking the result placeholder uploads a finished image without OpenAI and preserves its dimensions', async (t) => {
  const f = studioUI(t);
  const row = f.rows[0];
  const input = row.element.querySelector('.result-file-input');
  let opened = 0;
  input.click = () => opened++;
  row.element.querySelector('.result-placeholder').click();
  assert.equal(opened, 1);
  f.selectFile(input, f.file('fertiges-bild.jpg', 'image/jpeg', 1600, 1200));
  await until(() => row.result && !row.busy);
  assert.equal(f.requests.length, 0);
  assert.equal(row.image, null, 'No original or reviewed generation prompt is required');
  assert.equal(row.resultSize, '1600x1200');
  assert.equal(row.resultImported, true);
  assert.equal(row.resultJpeg.type, 'image/jpeg');
  assert.deepEqual(f.exports.at(-1), {
    width: 1600,
    height: 1200,
    type: 'image/jpeg',
    quality: 0.95,
  });
  assert.equal(row.element.querySelector('.button-download').download, 'fertiges-bild.jpg');
  assert(row.element.querySelector('.result-placeholder').hidden);
  assert.equal(f.$('image-count').textContent, '1 Bild');
  row.element.querySelector('[data-action="view"]').click();
  assert(f.$('result-viewer').open);
});

test('failed imports retain previous results and removing a row revokes both object URLs', async (t) => {
  const f = studioUI(t);
  const row = f.rows[0];
  const input = row.element.querySelector('.result-file-input');
  f.selectFile(input, f.file('fertig.jpg'));
  await until(() => row.result && !row.busy);
  const previous = [row.result, row.downloadUrl];
  f.selectFile(input, f.file('invalid.gif', 'image/gif'));
  await until(() => !row.busy);
  assert.deepEqual([row.result, row.downloadUrl], previous);
  assert(row.element.querySelector('.row-message').textContent.includes('JPG, PNG oder WebP'));
  assert.equal(f.requests.length, 0);
  row.element.querySelector('[data-action="remove"]').click();
  for (const url of previous) assert(f.revoked.includes(url));
  assert(!row.element.isConnected);
  assert.equal(f.$('image-count').textContent, 'Noch kein Bild');
});

test('adding an original creates a separate row instead of overwriting a finished result', async (t) => {
  const f = studioUI(t);
  const row = f.rows[0];
  f.selectFile(row.element.querySelector('.result-file-input'), f.file('fertig.jpg'));
  await until(() => row.result && !row.busy);
  const previous = row.result;
  f.selectFile(f.$('file-input'), f.file('original.jpg'));
  await until(() => f.rows.length === 2 && f.rows[1].image);
  assert.equal(row.result, previous);
  assert.equal(f.$('image-count').textContent, '2 Bilder');
  assert.equal(f.requests.length, 0);
});

test('cancelled imports and oversized files do not replace the previous result', async (t) => {
  const f = studioUI(t);
  const row = f.rows[0];
  const input = row.element.querySelector('.result-file-input');
  f.selectFile(input, f.file('fertig.jpg'));
  await until(() => row.result && !row.busy);
  const previous = row.result;
  let resolveBitmap;
  f.window.createImageBitmap = () =>
    new Promise((resolve) => {
      resolveBitmap = resolve;
    });
  f.selectFile(input, f.file('neu.jpg'));
  row.element.querySelector('[data-action="cancel"]').click();
  f.window.createImageBitmap = async () => ({width: 1024, height: 768, close() {}});
  resolveBitmap({width: 1024, height: 768, close() {}});
  await until(() => !row.busy);
  assert.equal(row.result, previous);
  const large = f.file('zu-gross.jpg');
  Object.defineProperty(large, 'size', {value: 11 * 1024 * 1024});
  f.selectFile(input, large);
  await until(() => !row.busy);
  assert.equal(row.result, previous);
  assert(row.element.querySelector('.row-message').textContent.includes('10 MB'));
  assert.equal(f.requests.length, 0);
});

test('removing a generated row preserves the session cost history', async (t) => {
  const f = studioUI(t, {
    generate: async () => ({
      image:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=',
      size: '1024x768',
      cost: {status: 'estimated', eur: 0.5, usd: 0.6},
    }),
  });
  f.$('api-key-input').value = 'test-only-placeholder';
  f.$('api-key-form').requestSubmit();
  f.selectFile(f.$('file-input'), f.file('original.jpg'));
  const row = f.rows[0];
  await until(() => row.image);
  row.draft.value = 'Ein Holzbrett mit schöner Gravur.';
  row.draft.dispatchEvent(new f.window.Event('input'));
  row.element.querySelector('[data-action="generate"]').click();
  await until(() => row.result && !row.busy);
  const spending = f.$('session-cost-total').textContent;
  assert(spending.includes('0,5000'));
  assert.equal(f.$('cost-history').children.length, 1);
  row.element.querySelector('[data-action="remove"]').click();
  assert.equal(f.$('session-cost-total').textContent, spending);
  assert.equal(f.$('cost-history').children.length, 1);
  f.selectFile(f.$('file-input'), f.file('zweites-original.jpg'));
  const second = f.rows.at(-1);
  await until(() => second.image);
  second.draft.value = 'Ein weiteres Holzbrett.';
  second.draft.dispatchEvent(new f.window.Event('input'));
  second.element.querySelector('[data-action="generate"]').click();
  await until(() => second.result && !second.busy);
  assert(f.$('session-cost-total').textContent.includes('1,0000'));
  assert.equal(f.$('cost-history').children.length, 2);
});
