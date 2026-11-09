import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import Jimp from 'jimp';
import YAML from 'yaml';
import Handlebars from 'handlebars';

const require = createRequire(import.meta.url);
require('ts-node/register');
const {
  readImageDescription,
  assertUniqueImageSidecars,
  imageDescriptionPath,
} = require('../image-descriptions.ts');
const {
  collectMissingDescriptions,
  generateDescriptions,
} = require('./generate-image-descriptions.ts');
const root = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'holzwerkskunst-descriptions-'));
  t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
  const products = path.join(cwd, 'products');
  const folder = path.join(products, 'beispiel');
  fs.mkdirSync(folder, {recursive: true});
  fs.writeFileSync(
    path.join(folder, 'spec.yaml'),
    'id: beispiel\nname: Holzbrett\ndescription: Ein Brett mit Gravur\n',
  );
  const image = path.join(folder, '10.JPG');
  await new Jimp(400, 300, 0xffffffff).writeAsync(image);
  return {cwd, products, folder, image, file: path.join(folder, '10.yaml')};
}

test('sidecars require only description, with non-blocking fallback and warnings', async (t) => {
  const {image, file} = await fixture(t);
  const warnings = [];
  const read = () => readImageDescription(image, 'Holzbrett', (message) => warnings.push(message));
  assert.equal(read(), 'Holzbrett');
  assert(warnings[0].includes('10.yaml'));
  for (const yaml of [
    'description: []',
    'description: ""',
    'description: test\nreviewed: false',
    'description: [',
    '[]',
  ]) {
    fs.writeFileSync(file, yaml);
    assert.equal(read(), 'Holzbrett');
  }
  fs.writeFileSync(
    file,
    YAML.stringify({description: '  Holzbrett mit "Valentin"\nund Feuerwehrmotiv  '}),
  );
  assert.equal(read(), 'Holzbrett mit "Valentin" und Feuerwehrmotiv');
});

test('renaming paired files preserves descriptions and ambiguous names are rejected', async (t) => {
  const {folder, image, file} = await fixture(t);
  assert.equal(imageDescriptionPath(image), file);
  fs.writeFileSync(file, 'description: Holzbrett mit Motiv\n');
  fs.renameSync(image, path.join(folder, '20.jpg'));
  fs.renameSync(file, path.join(folder, '20.yaml'));
  assert.equal(
    readImageDescription(path.join(folder, '20.jpg'), 'Fallback'),
    'Holzbrett mit Motiv',
  );
  assert.throws(() =>
    assertUniqueImageSidecars([path.join(folder, '20.jpg'), path.join(folder, '20.png')]),
  );
  assert.throws(() => assertUniqueImageSidecars([path.join(folder, 'spec.jpg')]));
});

test('templates safely escape descriptions in cards, gallery images and data attributes', () => {
  const h = Handlebars.create();
  for (const name of ['icon', 'categoryUrl', 'categoryLabel', 'inquiryUrl']) {
    h.registerHelper(name, () => '');
  }
  h.registerHelper('json', JSON.stringify);
  h.registerHelper('imageNumber', (index) => index + 1);
  const description = '" onerror="alert(1)" <script>Text</script> & Motiv';
  const product = {
    name: 'Holzbrett',
    id: 'example',
    tags: [],
    images: [{small: 'small.jpg', large: 'large.jpg', description}],
  };
  for (const [file, model] of [
    ['preview', product],
    ['product', {product}],
  ]) {
    const template = fs.readFileSync(path.join(root, `src/${file}.html.mustache`), 'utf8');
    const html = h.compile(template)(model);
    assert(html.includes(`alt="${h.escapeExpression(description)}"`));
    assert(!html.includes('<script>Text</script>'));
    assert(!html.includes(' onerror="'));
    if (file === 'product')
      assert(html.includes(`data-description="${h.escapeExpression(description)}"`));
  }
});

test('preview lists missing files without credentials, API calls or file changes', async (t) => {
  const {cwd, products, file} = await fixture(t);
  assert.equal(collectMissingDescriptions(products).length, 1);
  assert.throws(() => collectMissingDescriptions(products, '../outside'));
  const result = spawnSync(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register'),
      path.join(root, 'scripts/generate-image-descriptions.ts'),
      '--limit',
      '1',
    ],
    {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
      env: {...process.env, OPENAI_API_KEY: '', TS_NODE_PROJECT: path.join(root, 'tsconfig.json')},
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert(result.stdout.includes('10.yaml'));
  assert(result.stdout.includes('keine API-Anfragen'));
  assert(!fs.existsSync(file));
  fs.writeFileSync(file, 'unfinished draft');
  assert.equal(
    collectMissingDescriptions(products).length,
    0,
    'Even incomplete existing files stay untouched',
  );
});

test('generation sends image and context, writes only description, and skips existing files', async (t) => {
  const {products, file} = await fixture(t);
  const tasks = collectMissingDescriptions(products);
  let calls = 0;
  const client = {
    responses: {
      create: async (request) => {
        calls++;
        assert.equal(request.store, false);
        assert.equal(request.model, 'test-model');
        assert.equal(request.input[0].content[0].type, 'input_text');
        assert(request.input[0].content[0].text.includes('Holzbrett'));
        assert.match(request.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
        return {
          status: 'completed',
          output_text: 'Holzbrett mit "Valentin": ein Feuerwehrmotiv.',
          usage: {input_tokens: 10, output_tokens: 8},
        };
      },
    },
  };
  const logs = [];
  assert.equal(
    await generateDescriptions(tasks, client, 'test-model', undefined, (s) => logs.push(s)),
    1,
  );
  const original = fs.readFileSync(file, 'utf8');
  assert.deepEqual(YAML.parse(original), {
    description: 'Holzbrett mit "Valentin": ein Feuerwehrmotiv.',
  });
  assert.equal(await generateDescriptions(tasks, client, 'test-model'), 0);
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert(logs.some((s) => s.includes('Token-Nutzung')));
});

test('failed, incomplete and cancelled requests create no YAML or leak upstream errors', async (t) => {
  const {products, file} = await fixture(t);
  const tasks = collectMissingDescriptions(products);
  await assert.rejects(
    generateDescriptions(
      tasks,
      {
        responses: {
          create: async () => {
            throw new Error('SECRET upstream details');
          },
        },
      },
      'test-model',
    ),
    (error) => !error.message.includes('SECRET'),
  );
  assert(!fs.existsSync(file));
  for (const response of [
    {status: 'incomplete', output_text: 'partial'},
    {status: 'completed', output_text: ''},
  ]) {
    await assert.rejects(
      generateDescriptions(tasks, {responses: {create: async () => response}}, 'test-model'),
    );
    assert(!fs.existsSync(file));
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    generateDescriptions(
      tasks,
      {responses: {create: async () => assert.fail('No request after cancellation')}},
      'test-model',
      controller.signal,
    ),
  );
  assert(!fs.existsSync(file));
});

test('generation never overwrites a sidecar created while the API request was running', async (t) => {
  const {products, file} = await fixture(t);
  const tasks = collectMissingDescriptions(products);
  const client = {
    responses: {
      create: async () => {
        fs.writeFileSync(file, 'description: Manuell erstellt\n');
        return {status: 'completed', output_text: 'AI draft'};
      },
    },
  };
  assert.equal(await generateDescriptions(tasks, client, 'test-model'), 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'description: Manuell erstellt\n');
});
