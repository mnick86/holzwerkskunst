import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
// libvips' file cache otherwise keeps Windows fixture files open after metadata reads.
sharp.cache(false);
const root = fileURLToPath(new URL('../', import.meta.url));
const fixtureImage = (width, height) =>
  sharp({create: {width, height, channels: 3, background: '#ffffff'}});

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'holzwerkskunst-transform-'));
  t.after(() => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(cwd));
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    assert(path.basename(cwd).startsWith('holzwerkskunst-transform-'));
    fs.rmSync(cwd, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  });
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
  await fixtureImage(400, 300).toFile(path.join(product, 'valid.jpg'));
  await fixtureImage(300, 300).toFile(path.join(product, 'square.png'));
  await fixtureImage(300, 400).toFile(path.join(product, 'portrait.jpg'));
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
  await fixtureImage(400, 300).toFile(path.join(product, '10.JPG'));

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert(
    result.stdout.indexOf('Bildprüfung erfolgreich') < result.stdout.indexOf('process example'),
  );
  assert(!fs.existsSync(path.join(output, 'previous-output.txt')));
  const [data] = JSON.parse(fs.readFileSync(path.join(output, 'products.json'), 'utf8'));
  assert.equal(data.id, 'example');
  assert.equal(data.images.length, 1);
  assert.equal(data.images[0].description, 'Beispiel');
  assert.equal(data.images[0].id, '10');
  assert.equal(data.images[0].filename, '10.JPG');
  assert.match(result.stderr, /10\.yaml/);
  for (const [size, width, height] of [
    ['small', 400, 300],
    ['large', 1024, 768],
  ]) {
    assert(data.images[0][size].endsWith('.webp'));
    const image = await sharp(path.join(output, data.images[0][size])).metadata();
    assert.equal(image.format, 'webp');
    assert.equal(image.width, width);
    assert.equal(image.height, height);
  }
});

test('image sidecars reach generated data and malformed descriptions fall back', async (t) => {
  const {cwd, product, output} = fixture(t);
  for (const name of ['10.jpg', '20.png', '30.jpeg']) {
    await fixtureImage(400, 300).toFile(path.join(product, name));
  }
  fs.writeFileSync(
    path.join(product, '10.yaml'),
    'description: \'Holzbrett mit Motiv und "Valentin"\'\n',
  );
  fs.writeFileSync(path.join(product, '20.yaml'), 'description: [invalid]\n');
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  const [data] = JSON.parse(fs.readFileSync(path.join(output, 'products.json'), 'utf8'));
  const descriptions = new Map(
    data.images.map((image) => [path.parse(image.small).name, image.description]),
  );
  assert.equal(descriptions.get('10__400_300'), 'Holzbrett mit Motiv und "Valentin"');
  assert.equal(descriptions.get('20__400_300'), 'Beispiel');
  assert.equal(descriptions.get('30__400_300'), 'Beispiel');
  assert.match(result.stderr, /20\.yaml/);
  assert.match(result.stderr, /30\.yaml/);
});

test('WebP variants preserve PNG transparency, original pixels and the paired description file', async (t) => {
  const {cwd, product, output} = fixture(t);
  const source = path.join(product, '20.png');
  const center = await sharp({
    create: {width: 200, height: 150, channels: 4, background: '#ff0000'},
  })
    .png()
    .toBuffer();
  await sharp({create: {width: 400, height: 300, channels: 4, background: '#00000000'}})
    .composite([{input: center, left: 100, top: 75}])
    .png()
    .toFile(source);
  const sidecar = path.join(product, '20.yaml');
  fs.writeFileSync(sidecar, 'description: Rotes Motiv mit transparentem Rand.\n');
  const original = fs.readFileSync(source);
  const description = fs.readFileSync(sidecar);
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  const [data] = JSON.parse(fs.readFileSync(path.join(output, 'products.json'), 'utf8'));
  assert.equal(data.images[0].id, '20');
  assert.equal(data.images[0].filename, '20.png');
  assert.equal(data.images[0].description, 'Rotes Motiv mit transparentem Rand.');
  for (const size of ['small', 'large']) {
    const {data: pixels, info} = await sharp(path.join(output, data.images[0][size]))
      .ensureAlpha()
      .raw()
      .toBuffer({resolveWithObject: true});
    assert.equal(pixels[3], 0, 'Transparent corners must not be flattened');
    const middle = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
    assert(pixels[middle] > 240 && pixels[middle + 1] < 20 && pixels[middle + 2] < 20);
    assert.equal(pixels[middle + 3], 255);
  }
  assert(fs.readFileSync(source).equals(original));
  assert(fs.readFileSync(sidecar).equals(description));
});
