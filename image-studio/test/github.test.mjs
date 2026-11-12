import assert from 'node:assert/strict';
import test from 'node:test';
import {parse} from 'yaml';
import {
  createGitHubClient,
  validateProduct,
  productYaml,
  imageFilename,
  nextFilename,
  branchName,
  compareCatalogImages,
  validateProductTags,
} from '../public/github.mjs';
import {createGitHubFixture} from './github-fixture.mjs';

const product = {
  id: 'holz-laterne',
  name: 'Holzlaterne',
  description: 'Ein Licht mit persönlicher Gravur.',
  date: '2026-11-12',
  tags: ['Geschenk', 'Geburtstag'],
};
const jpeg = new Blob([new Uint8Array([255, 216, 255, 224, 0, 0])], {type: 'image/jpeg'});
function fixture(options = {}) {
  const mock = createGitHubFixture();
  const service = createGitHubClient({
    getToken: () => 'test-only-placeholder',
    fetchImpl: mock.fetch,
    getDimensions: async () => ({width: 1024, height: 768}),
    ...options,
  });
  return {mock, service};
}

test('new product fields and filenames are validated and YAML preserves quoted dates', () => {
  assert.deepEqual(parse(productYaml(product)), product);
  assert.match(productYaml(product), /date: '2026-11-12'/);
  for (const value of [
    {...product, id: '../evil'},
    {...product, tags: ['../evil']},
    {...product, description: ''},
    {...product, date: '2026-02-30'},
  ])
    assert.throws(() => validateProduct(value));
  assert.equal(imageFilename('20'), '20.jpg');
  assert.equal(imageFilename('20.JPEG'), '20.jpg');
  for (const value of ['../20.jpg', 'spec.jpg', '.hidden', 'x/y', 'a?x'])
    assert.throws(() => imageFilename(value));
  assert.equal(
    nextFilename(
      ['products/test/10.jpg', 'products/test/100__photo.jpg', 'products/other/999.jpg'],
      'test',
    ),
    '110.jpg',
  );
});

test('one session supports several images and commits a new spec and sidecar atomically', async () => {
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Neue Bilder');
  const branch = service.getState().session.branch;
  assert.equal(mock.prs.size, 0, 'No empty PR');
  await service.refresh({loadProducts: true});
  service.addProduct(product);
  assert(
    !mock.calls.some((c) => c.method === 'POST' && c.route === '/git/blobs'),
    'New product is local until first image',
  );
  await service.addImage({
    folder: product.id,
    filename: '10',
    blob: jpeg,
    description: 'Eine Laterne mit „Licht“ & Herz.',
  });
  const firstTree = mock.calls.find((c) => c.method === 'POST' && c.route === '/git/trees');
  assert.deepEqual(
    firstTree.body.tree.map((x) => x.path),
    [
      'products/holz-laterne/10.jpg',
      'products/holz-laterne/spec.yaml',
      'products/holz-laterne/10.yaml',
    ],
  );
  const sidecar = mock.calls.find(
    (c) =>
      c.route === '/git/blobs' &&
      c.body.content?.includes('description:') &&
      !c.body.content.includes('id:'),
  );
  assert.deepEqual(Object.keys(parse(sidecar.body.content)), ['description']);
  await service.addImage({folder: 'brotzeitbrettchen', filename: '20.jpg', blob: jpeg});
  assert.equal(mock.prs.size, 1);
  assert.equal(service.getState().session.branch, branch);
  assert.equal(mock.refs.get('main'), 'c0', 'No main changes before Publish');
  assert.equal(service.getState().files.length, 4);
  assert(mock.calls.every((c) => !c.url.includes('test-only-placeholder')));
  assert(mock.calls.every((c) => c.authorization?.includes('test-only-placeholder')));
  assert(mock.calls.filter((c) => c.method === 'PATCH').every((c) => c.body.force === false));
  await service.publish();
  assert(service.getState().session.merged);
  const merge = mock.calls.find((c) => c.method === 'PUT');
  assert.equal(merge.body.sha, service.getState().session.head);
  assert.equal(merge.body.merge_method, 'squash');
  assert.equal(service.getState().deployment.status, 'queued');
});

test('invalid format, path collisions and duplicate product IDs make no Git writes', async () => {
  const {mock, service} = fixture({getDimensions: async () => ({width: 1024, height: 1024})});
  await service.connect();
  await service.start('Test');
  const writes = () => mock.calls.filter((c) => c.method !== 'GET').length;
  const previous = writes();
  await assert.rejects(
    service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg}),
    /4:3/,
  );
  await assert.rejects(
    service.addImage({folder: 'brotzeitbrettchen', filename: '10', blob: jpeg}),
    /existiert/,
  );
  await assert.rejects(service.addImage({folder: '../other', filename: '20', blob: jpeg}));
  assert.throws(() => service.addProduct({...product, id: 'brotzeitbrettchen'}));
  assert.equal(writes(), previous);
});

test('publish resumes the same PR after reload', async () => {
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Fortsetzen');
  await service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg});
  const saved = service.getState().session;
  const resumed = createGitHubClient({
    getToken: () => 'new-test-placeholder',
    fetchImpl: mock.fetch,
    getDimensions: async () => ({width: 1024, height: 768}),
  });
  await resumed.connect(saved);
  assert.equal(resumed.getState().session.pullNumber, saved.pullNumber);
  await resumed.addImage({folder: 'brotzeitbrettchen', filename: '30', blob: jpeg});
  assert.equal(mock.prs.size, 1);
  await resumed.publish();
  assert(resumed.getState().session.merged);
});

test('external changes require review before merging the entire selected branch', async () => {
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Test');
  await service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg});
  const session = service.getState().session;
  const current = mock.commits.get(session.head);
  const tree = new Map(mock.trees.get(current.tree));
  tree.set('src/site.js', 'b1');
  mock.trees.set('external-tree', tree);
  mock.commits.set('external-commit', {tree: 'external-tree', parents: [session.head]});
  mock.refs.set(session.branch, 'external-commit');
  await assert.rejects(service.publish(), /geändert/);
  assert(!mock.calls.some((c) => c.method === 'PUT'));
  await service.publish();
  assert(service.getState().session.merged);
});

test('upstream errors are sanitized, do not retry, and never merge a failed upload', async () => {
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Test');
  const branch = service.getState().session.branch;
  mock.fail = `PATCH /git/refs/heads/${branch}`;
  await assert.rejects(
    service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg}),
    (error) => !error.message.includes('PRIVATE'),
  );
  assert.equal(mock.calls.filter((c) => `${c.method} ${c.route}` === mock.fail).length, 1);
  assert.equal(mock.refs.get(branch), 'c0');
  assert.equal(mock.refs.get('main'), 'c0');
  assert.equal(mock.prs.size, 0);
});

test('requests never accept a saved session targeting main or another repository', async () => {
  const {service} = fixture();
  await assert.rejects(
    service.connect({owner: 'mnick86', repo: 'holzwerkskunst', branch: 'main', base: 'main'}),
    /ungültig/,
  );
});

test('pending product drafts survive reconnect and must be uploaded or discarded before merging', async () => {
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Produktentwurf');
  await service.refresh({loadProducts: true});
  service.addProduct(product);
  await service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg});
  const resumed = createGitHubClient({
    getToken: () => 'test-only-placeholder',
    fetchImpl: mock.fetch,
  });
  await resumed.connect(service.getState().session);
  assert(resumed.getState().products.some((p) => p.id === product.id && p.pending));
  await assert.rejects(resumed.publish(), /Produkte ohne Bild/);
  assert(!mock.calls.some((c) => c.method === 'PUT'));
  resumed.discardProduct(product.id);
  await resumed.publish();
  assert(resumed.getState().session.merged);
});

test('branch names follow titles and collisions never overwrite an existing branch', async () => {
  assert.equal(branchName('Für schöne Grüße!'), 'image-studio/fuer-schoene-gruesse');
  const {mock, service} = fixture();
  mock.refs.set('image-studio/test', 'c0');
  await service.connect();
  await service.start('Test');
  assert.equal(service.getState().session.branch, 'image-studio/test-2');
  assert.equal(mock.refs.get('image-studio/test'), 'c0');
  assert.equal(mock.prs.size, 0);
});

test('all branch pages are loaded and selecting an arbitrary branch is read-only', async () => {
  const {mock, service} = fixture();
  mock.refs.set('gh-pages', 'c0');
  for (let i = 0; i < 105; i++) mock.refs.set(`feature/${i}`, 'c0');
  await service.connect();
  const branches = service.getState().branches;
  assert.equal(branches.length, 105);
  assert(!branches.includes('main') && !branches.includes('gh-pages'));
  assert(mock.calls.some((c) => c.route === '/branches' && c.url.includes('page=2')));
  await service.selectBranch('feature/104');
  assert.equal(service.getState().session.branch, 'feature/104');
  assert(mock.calls.every((c) => c.method === 'GET'));
  for (const branch of ['main', 'gh-pages', 'missing'])
    await assert.rejects(service.selectBranch(branch), /vorhandenen Branch/);
  assert.equal(service.getState().session.branch, 'feature/104');
});

test('specs load only on demand and cache by content SHA across refreshes and branches', async () => {
  const {mock, service} = fixture();
  const otherSpec = 'id: other\nname: Anderes Produkt\ntags: [Geschenk]\n';
  mock.blobs.set('other-spec', {encoding: 'base64', content: btoa(otherSpec)});
  mock.trees.get('t0').set('products/other/spec.yaml', 'other-spec');
  mock.refs.set('feature/catalog', 'c0');
  const specReads = () =>
    mock.calls.filter(
      (c) => c.method === 'GET' && /\/git\/blobs\/(b0|other-spec|changed-spec)$/.test(c.route),
    );
  await service.connect();
  await service.selectBranch('feature/catalog');
  assert.equal(specReads().length, 0);
  await service.refresh({loadProducts: 'brotzeitbrettchen'});
  assert.deepEqual(
    specReads().map((c) => c.route),
    ['/git/blobs/b0'],
  );
  assert.equal(service.getState().catalogProductsLoaded, false);
  await service.refresh({loadProducts: 'brotzeitbrettchen'});
  await service.start('Gleiche Metadaten');
  await service.refresh({loadProducts: 'brotzeitbrettchen'});
  assert.equal(specReads().length, 1);
  const branch = service.getState().session.branch;
  const changedTree = new Map(mock.trees.get('t0'));
  changedTree.set('products/brotzeitbrettchen/spec.yaml', 'changed-spec');
  mock.blobs.set('changed-spec', {
    encoding: 'base64',
    content: btoa('id: brotzeitbrettchen\nname: Neuer Name\ntags: [Geschenk]\n'),
  });
  mock.trees.set('changed-tree', changedTree);
  mock.commits.set('changed-head', {tree: 'changed-tree', parents: ['c0']});
  mock.refs.set(branch, 'changed-head');
  await service.refresh({loadProducts: 'brotzeitbrettchen'});
  assert.equal(specReads().length, 2);
  assert.equal(service.getState().products[0].name, 'Neuer Name');
  await service.refresh({loadProducts: true});
  assert.equal(specReads().length, 3);
  assert.equal(service.getState().catalogProductsLoaded, true);
  service.disconnect();
  await service.connect(service.getState().session);
  await service.refresh({loadProducts: 'brotzeitbrettchen'});
  assert.equal(specReads().length, 4, 'Disconnect clears parsed product data');
});

test('unknown tags, including capitalization changes, cannot create or upload product drafts', async () => {
  validateProductTags(' Geschenk, Geburtstag ', ['Geschenk', 'Geburtstag']);
  assert.throws(
    () => validateProductTags('geschenk, Hochzeit', ['Geschenk']),
    /geschenk.*Hochzeit/,
  );
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Kategorien');
  await service.refresh({loadProducts: true});
  const writes = mock.calls.filter((c) => c.method !== 'GET').length;
  assert.throws(() => service.addProduct({...product, tags: ['Weihnachten']}), /Unbekannte Tags/);
  assert.equal(service.getState().session.drafts.length, 0);
  const saved = service.getState().session;
  saved.drafts = [{...product, tags: ['Weihnachten']}];
  await service.connect(saved);
  await assert.rejects(
    service.addImage({folder: product.id, filename: '10', blob: jpeg}),
    /Unbekannte Tags/,
  );
  assert.equal(mock.calls.filter((c) => c.method !== 'GET').length, writes);
});

test('uploaded images immediately appear in the selected branch and commit counts survive stale PR metadata', async () => {
  const {mock, service} = fixture();
  await service.connect();
  await service.start('Bilder');
  mock.stalePulls = true;
  await service.addImage({
    folder: 'brotzeitbrettchen',
    filename: '50',
    blob: jpeg,
    description: 'Holzbrett',
  });
  await service.addImage({
    folder: 'brotzeitbrettchen',
    filename: '60',
    blob: jpeg,
    description: 'Gravur',
  });
  await service.refresh({loadProducts: 'brotzeitbrettchen'});
  const state = service.getState();
  assert.equal(state.aheadBy, 2);
  assert.equal(state.catalogBranch, state.session.branch);
  assert.equal(state.catalogHead, mock.refs.get(state.session.branch));
  assert(state.imageFiles.some((image) => image.path.endsWith('/50.jpg')));
  assert(state.paths.some((file) => file.endsWith('/50.yaml')));
  assert(!mock.trees.get('t0').has('products/brotzeitbrettchen/50.jpg'));
  const image = state.imageFiles.find((entry) => entry.path.endsWith('/50.jpg'));
  const preview = await service.readImage(image.path, undefined, image.sha);
  assert.equal(preview.type, 'image/jpeg');
  await assert.rejects(
    service.readImage(image.path, undefined, 'wrong-sha'),
    /nicht mehr verfügbar/,
  );
  await service.publish();
  assert.equal(service.getState().session.merged, true);
});

test('merge deletes only its successfully merged source branch', async () => {
  const {mock, service} = fixture();
  mock.refs.set('gh-pages', 'c0');
  await service.connect();
  await service.start('Aufräumen');
  const branch = service.getState().session.branch;
  await service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg});
  const result = await service.publish();
  assert.deepEqual(result, {branchDeleted: true, deletionWarning: ''});
  assert(!mock.refs.has(branch));
  assert(!service.getState().branches.includes(branch));
  assert(mock.refs.has('main') && mock.refs.has('gh-pages'));
  const merge = mock.calls.findIndex((c) => c.method === 'PUT');
  const deletion = mock.calls.findIndex((c) => c.method === 'DELETE');
  assert(deletion > merge);
  await service.connect(service.getState().session);
  assert.equal(service.getState().session.merged, true);
});

for (const scenario of [
  'already deleted',
  'deletion forbidden',
  'new commits',
  'deployment unavailable',
]) {
  test(`successful merge is preserved when ${scenario}`, async () => {
    const {mock, service} = fixture();
    await service.connect();
    await service.start('Merge');
    const branch = service.getState().session.branch;
    await service.addImage({folder: 'brotzeitbrettchen', filename: '20', blob: jpeg});
    if (scenario === 'already deleted') mock.onMerge = () => mock.refs.delete(branch);
    if (scenario === 'deletion forbidden') {
      mock.fail = `DELETE /git/refs/heads/${branch}`;
      mock.failureStatus = 403;
    }
    if (scenario === 'new commits')
      mock.onMerge = (p) => {
        mock.commits.set('new-work', {
          tree: mock.commits.get(p.headSha).tree,
          parents: [p.headSha],
        });
        mock.refs.set(branch, 'new-work');
      };
    if (scenario === 'deployment unavailable') mock.deployment = 'unavailable';
    const result = await service.publish();
    assert(service.getState().session.merged);
    if (['deletion forbidden', 'new commits'].includes(scenario)) {
      assert(result.deletionWarning.includes('Merge war erfolgreich'));
      assert(mock.refs.has(branch));
    } else assert(result.branchDeleted);
    if (scenario === 'new commits') assert(!mock.calls.some((c) => c.method === 'DELETE'));
    if (scenario === 'deployment unavailable')
      assert.equal(service.getState().deployment.status, 'unavailable');
  });
}

test('catalog thumbnail ordering uses numeric prefixes and full filename stems', () => {
  const names = ['z.jpg', '100__photo.png', '20.png', '10.jpg', 'a.jpeg'];
  assert.deepEqual(names.sort(compareCatalogImages), [
    '10.jpg',
    '20.png',
    '100__photo.png',
    'a.jpeg',
    'z.jpg',
  ]);
});
