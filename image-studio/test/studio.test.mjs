import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createOpenAIClient, validateRequest} from '../public/openai.mjs';
import {buildImageStudio, PUBLIC_FILES} from '../build.mjs';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=';
const image = 'data:image/png;base64,' + PNG;
const config = {apiKey: 'sk-fake-test-only', usdToEur: 0.9};
const draft =
  'Fotografiere das gravierte Holzprodukt auf hellem Leinen bei weichem Tageslicht. Alle Beschriftungen exakt erhalten.';
const analysis = {
  status: 'completed',
  usage: {input_tokens: 1000, output_tokens: 200, input_tokens_details: {cached_tokens: 100}},
  output: [{type: 'message', content: [{type: 'output_text', text: draft}]}],
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

test('browser validation checks image type/size, prompt length and output format before API requests', () => {
  assert.deepEqual(validateRequest({image}, 'analyze'), {image, size: '1024x768'});
  assert.equal(validateRequest({prompt: ' Test '}, 'improve').prompt, 'Test');
  assert.throws(
    () => validateRequest({image: image.replace('image/png', 'image/jpeg')}, 'analyze'),
    /stimmen nicht/,
  );
  assert.throws(
    () => validateRequest({image: 'data:image/svg+xml;base64,PHN2Zz4='}, 'analyze'),
    /gültiges/,
  );
  assert.throws(() => validateRequest({image: 'x'.repeat(14_000_000)}, 'analyze'), /10 MB/);
  assert.throws(() => validateRequest({prompt: ' '}, 'improve'), /Verbessern/);
  assert.throws(() => validateRequest({image, prompt: ' '}, 'generate'), /Bildprompt/);
  assert.throws(() => validateRequest({prompt: 'x'.repeat(16001)}, 'improve'), /16000/);
  assert.throws(
    () => validateRequest({image, prompt: 'test', size: '999x999'}, 'generate'),
    /Bildformat/,
  );
});

test('browser analysis sends only the reference image and format to OpenAI and returns a German draft with usage costs', async () => {
  const calls = [];
  const client = createOpenAIClient(config, async (url, options) => {
    calls.push({url, options, body: JSON.parse(options.body)});
    return json(analysis);
  });
  const result = await client.analyze({image, size: '1024x768'});
  assert.equal(result.prompt, draft);
  assert(Math.abs(result.cost.eur - 0.003798) < 1e-12);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(
    new Headers(calls[0].options.headers).get('authorization'),
    'Bearer ' + config.apiKey,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.mode, 'cors');
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.input[0].content[1].image_url, image);
  assert.match(calls[0].body.instructions, /prompt in German/);
  assert.match(calls[0].body.instructions, /do not translate them/);
});

test('prompt improvement transmits only the entered draft and format, never an image', async () => {
  let sent;
  const prompt = 'Weiches Licht. Erhalte die Gravur "Happy Birthday, Emma!". Keine Blumen.';
  const client = createOpenAIClient(config, async (url, options) => {
    sent = JSON.parse(options.body);
    return json(analysis);
  });
  assert.equal((await client.improve({prompt, size: '768x1024'})).prompt, draft);
  assert.equal(sent.input[0].content.length, 1);
  assert.equal(sent.input[0].content[0].type, 'input_text');
  assert(sent.input[0].content[0].text.endsWith(prompt));
  assert.match(sent.input[0].content[0].text, /768x1024/);
  assert.match(sent.instructions, /natural German/);
  assert.match(sent.instructions, /Preserve the user's creative intent/);
  assert.match(sent.instructions, /No reference image is provided/);
});

test('generation and follow-up editing forward the reviewed prompt and supplied reference verbatim', async () => {
  const calls = [];
  const client = createOpenAIClient(config, async (url, options) => {
    assert(options.body instanceof FormData, 'SDK image editing must send a multipart upload');
    const body = Object.fromEntries(options.body.entries());
    assert.equal(
      new Headers(options.headers).get('content-type'),
      null,
      'Browser sets the multipart boundary',
    );
    assert.equal(body.image.type, 'image/png');
    const dataUrl =
      'data:image/png;base64,' + Buffer.from(await body.image.arrayBuffer()).toString('base64');
    calls.push({url, body, dataUrl});
    return json({
      data: [{b64_json: PNG}],
      usage: {
        input_tokens: 1100,
        output_tokens: 2000,
        input_tokens_details: {text_tokens: 100, image_tokens: 1000},
      },
    });
  });
  const result = await client.generate({
    image,
    prompt: 'Gravur erhalten. Weiches Tageslicht.',
    size: '768x1024',
  });
  assert.equal(result.image, image);
  assert.equal(result.size, '768x1024');
  assert(Math.abs(result.cost.eur - 0.06165) < 1e-12);
  await client.generate({image: result.image, prompt: 'Etwas wärmeres Licht.', size: result.size});
  assert(calls.every((call) => call.url === 'https://api.openai.com/v1/images/edits'));
  assert.equal(calls[0].body.prompt, 'Gravur erhalten. Weiches Tageslicht.');
  assert.equal(calls[1].body.prompt, 'Etwas wärmeres Licht.');
  assert.equal(calls[0].dataUrl, image);
  assert.equal(calls[1].dataUrl, result.image);
  assert.equal(calls[1].body.output_format, 'png');
});

test('each browser request snapshots its current key and missing credentials never make a request', async () => {
  let key = 'sk-fake-a';
  const seen = [];
  const client = createOpenAIClient({...config, getApiKey: () => key}, async (url, options) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(new Headers(options.headers).get('authorization'));
    return json(analysis);
  });
  const first = client.improve({prompt: 'a'});
  key = 'sk-fake-b';
  const second = client.improve({prompt: 'b'});
  await Promise.all([first, second]);
  assert.deepEqual(seen, ['Bearer sk-fake-a', 'Bearer sk-fake-b']);
  key = '';
  await assert.rejects(
    client.improve({prompt: 'a'}),
    (error) => error.cost.status === 'not_requested',
  );
  key = 'two words';
  await assert.rejects(
    client.improve({prompt: 'a'}),
    (error) => error.cost.status === 'not_requested',
  );
  assert.equal(seen.length, 2);
});

test('failures retain known usage while errors never echo upstream secrets', async () => {
  const incomplete = createOpenAIClient(config, async () =>
    json({...analysis, status: 'incomplete'}),
  );
  await assert.rejects(
    incomplete.improve({prompt: 'test'}),
    (error) => error.status === 502 && error.cost.eur > 0,
  );
  const refused = createOpenAIClient(config, async () =>
    json({...analysis, output: [{type: 'message', content: [{type: 'refusal'}]}]}),
  );
  await assert.rejects(
    refused.analyze({image}),
    (error) => error.status === 422 && error.cost.eur > 0,
  );
  const denied = createOpenAIClient(config, async () =>
    json({error: {message: config.apiKey}}, 401),
  );
  await assert.rejects(
    denied.improve({prompt: 'test'}),
    (error) => !error.message.includes(config.apiKey) && error.cost.eur === null,
  );
  const offline = createOpenAIClient(config, async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    offline.improve({prompt: 'test'}),
    (error) => error.cost.status === 'unavailable',
  );
});

test('cancellation is reported with known usage if the API has already returned it', async () => {
  const controller = new AbortController();
  const client = createOpenAIClient(
    config,
    async () => json(analysis),
    async () => {
      controller.abort();
      return {usdToEur: 0.9, source: 'manual'};
    },
  );
  await assert.rejects(
    client.improve({prompt: 'test'}, controller.signal),
    (error) => error.status === 499 && error.cost.eur > 0,
  );
});

test('static build publishes only browser files with relative paths and no Node/backend dependencies', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'image-static-'));
  try {
    await buildImageStudio(pathToFileURL(folder + '/'));
    assert.deepEqual((await readdir(folder)).sort(), PUBLIC_FILES.slice().sort());
    const html = await readFile(join(folder, 'index.html'), 'utf8');
    assert.match(html, /src="\.\/studio.js" type="module"/);
    assert.match(html, /https:\/\/api.openai.com/);
    assert(!html.includes('src="/studio'));
    for (const file of PUBLIC_FILES.filter((file) => /\.(m?js)$/.test(file))) {
      const source = await readFile(join(folder, file), 'utf8');
      assert(!/\b(?:import|export)\s[^;]*?\bfrom\s*['"]node:/.test(source), file + ' imports Node');
      // The SDK includes diagnostic strings naming environment variables;
      // its runtime environment accesses are replaced by the browser build.
      if (file !== 'openai.mjs')
        assert(!source.includes('process.env'), file + ' reads environment');
      assert(!source.includes('/api/config'), file + ' depends on backend');
    }
    // Exercise the actual self-contained browser bundle, not only source imports.
    // SDK diagnostics mention node:buffer as text; esbuild checks actual imports.
    const bundled = await import(pathToFileURL(join(folder, 'openai.mjs')).href);
    const client = bundled.createOpenAIClient(config, async () => json(analysis));
    assert.equal((await client.improve({prompt: 'Tageslicht'})).prompt, draft);
  } finally {
    await rm(folder, {recursive: true, force: true});
  }
});

test('SDK retries are disabled and API errors retain reported usage without exposing raw errors', async () => {
  for (const status of [429, 500]) {
    let attempts = 0;
    const client = createOpenAIClient(config, async () => {
      attempts++;
      return json(
        {error: {code: 'insufficient_quota', message: config.apiKey}, usage: analysis.usage},
        status,
      );
    });
    await assert.rejects(
      client.improve({prompt: 'Tageslicht'}),
      (error) => error.cost.eur > 0 && !error.message.includes(config.apiKey),
    );
    assert.equal(attempts, 1, 'One click must not silently make additional paid attempts');
  }
});

test('SDK abort and connection errors preserve cancellation and never retry', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const client = createOpenAIClient(config, async (url, options) => {
    attempts++;
    return new Promise((resolve, reject) =>
      options.signal.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        {once: true},
      ),
    );
  });
  const pending = client.improve({prompt: 'Tageslicht'}, controller.signal);
  while (!attempts) await new Promise((resolve) => setTimeout(resolve, 1));
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error.status === 499 && error.cost.status === 'unavailable',
  );
  assert.equal(attempts, 1);
});
