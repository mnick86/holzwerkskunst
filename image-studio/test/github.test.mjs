import assert from 'node:assert/strict';
import test from 'node:test';
import {parse} from 'yaml';
import {
  createGitHubClient,
  validateProduct,
  productYaml,
  imageFilename,
  nextFilename,
} from '../public/github.mjs';
import {createGitHubFixture} from './github-fixture.mjs';

const product = {
  id: 'holz-laterne',
  name: 'Holzlaterne',
  description: 'Ein Licht mit persönlicher Gravur.',
  date: '2026-11-12',
  tags: ['Geschenk', 'Weihnachten'],
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
