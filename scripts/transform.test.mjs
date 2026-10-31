import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import Jimp from 'jimp';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'holzwerkskunst-transform-'));
  t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
  const product = path.join(cwd, 'products/example');
  const output = path.join(cwd, 'dist/bootstrap/produkt');
  fs.mkdirSync(product, {recursive: true});
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(
    path.join(product, 'spec.yaml'),
    'id: example\nname: Beispiel\ndescription: Beispielprodukt\ndate: "2026-10-31"\ntags: [Geschenk]\n',
  );
  fs.writeFileSync(path.join(output, 'previous-output.txt'), 'keep existing output');
  return {cwd, product, output};
}

function run(cwd) {
  return spawnSync(
    process.execPath,
    ['-r', require.resolve('ts-node/register'), path.join(root, 'transform.ts')],
    {
      cwd,
      encoding: 'utf8',
      env: {...process.env, TS_NODE_PROJECT: path.join(root, 'tsconfig.json')},
      timeout: 30000,
    },
  );
}

test('preflight reports every invalid image and preserves existing output', async (t) => {
  const {cwd, product, output} = fixture(t);
  await new Jimp(400, 300, 0xffffffff).writeAsync(path.join(product, 'valid.jpg'));
  await new Jimp(300, 300, 0xffffffff).writeAsync(path.join(product, 'square.png'));
  await new Jimp(300, 400, 0xffffffff).writeAsync(path.join(product, 'portrait.jpg'));
  fs.writeFileSync(path.join(product, 'unreadable.jpeg'), 'not an image');

  const result = run(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /3 von 4 Bildern/);
  for (const name of ['square.png', 'portrait.jpg', 'unreadable.jpeg']) {
    assert(result.stderr.includes(name), result.stderr);
  }
  assert(!result.stdout.includes('process '), result.stdout);
  assert.deepEqual(fs.readdirSync(output), ['previous-output.txt']);
  assert.equal(
    fs.readFileSync(path.join(output, 'previous-output.txt'), 'utf8'),
    'keep existing output',
  );
});

test('valid images pass preflight and generate both sizes and product data', async (t) => {
  const {cwd, product, output} = fixture(t);
  await new Jimp(400, 300, 0xffffffff).writeAsync(path.join(product, '10.JPG'));

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert(
    result.stdout.indexOf('Bildprüfung erfolgreich') < result.stdout.indexOf('process example'),
  );
  assert(!fs.existsSync(path.join(output, 'previous-output.txt')));
  const [data] = JSON.parse(fs.readFileSync(path.join(output, 'products.json'), 'utf8'));
  assert.equal(data.id, 'example');
  assert.equal(data.images.length, 1);
  for (const [size, width, height] of [
    ['small', 400, 300],
    ['large', 1024, 768],
  ]) {
    const image = await Jimp.read(path.join(output, data.images[0][size]));
    assert.equal(image.getWidth(), width);
    assert.equal(image.getHeight(), height);
  }
});
