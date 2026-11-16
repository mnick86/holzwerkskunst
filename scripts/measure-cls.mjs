// Real Chromium layout-shift measurements, not Lighthouse scores or field data.
// Build first. Example: node scripts/measure-cls.mjs --output tmp/cls-before.json --diagnose
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const output = path.resolve(option('--output', 'tmp/cls-report.json'));
const repetitions = Number(option('--runs', '3'));
assert(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 10);
const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => candidate && existsSync(candidate));
assert(chrome, 'Set CHROME_PATH to an installed Chrome/Chromium executable.');
const root = path.resolve('dist/bootstrap');
assert(existsSync(path.join(root, 'index.html')), 'Run transform and mustache first.');
mkdirSync(path.dirname(output), {recursive: true});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let active = {};
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) throw new Error('Invalid path');
    if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const settings = {...active};
    const isJs = pathname === '/assets/site.js';
    const delayedImage = /hero-werkstatt|\/produkt\/.*\.(webp|png|jpe?g)$/.test(pathname);
    if (settings.delayed && (isJs || delayedImage)) {
      await settings.paintReady;
      await pause(isJs ? 1400 : 700);
    }
    let body = readFileSync(file);
    if (isJs) {
      let code = body.toString('utf8');
      for (const [name, statement] of [
        ['sort', 'sortControl.hidden = false;'],
        ['gallery', 'if (controls) controls.hidden = false;'],
        ['share', 'button.hidden = false;'],
      ]) {
        if (settings.hold === name) {
          assert(code.includes(statement), `Ablation no longer matches ${name}`);
          code = code.replace(statement, '/* diagnostic: hold this enhancement hidden */');
        }
      }
      body = Buffer.from(
        `window.__cls?.snapshot('before-js');\n${code}\nwindow.__cls?.snapshot('after-js');`,
      );
    }
    if (settings.heroRatio && pathname === '/assets/site.css') {
      const css = body.toString('utf8');
      assert(css.includes('.hero-visual img {'), 'Hero diagnostic no longer matches the CSS');
      body = Buffer.from(
        css.replace(
          /(\.hero-visual img\s*\{)([^}]*)(\})/,
          (_, start, declarations, end) =>
            start +
            declarations.replace(/aspect-ratio\s*:[^;]*;/g, '') +
            '\n  aspect-ratio: auto 1672 / 941;\n' +
            end,
        ),
      );
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404);
    response.end(String(error.message));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = path.join(tmpdir(), `holzwerkskunst-cls-${process.pid}-${Date.now()}`);
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    'about:blank',
  ],
  {stdio: 'ignore', windowsHide: true},
);

// Injected before page scripts. Sources are MOVED elements; causes require an ablation.
function observeLayout() {
  const selectors = [
    '.hero',
    '.hero-visual',
    '.hero-visual img',
    '.hero-visual figcaption',
    '.catalog-heading',
    '[data-sort-control]',
    '[data-product-grid]',
    '.gallery-stage',
    '[data-main-image]',
    '[data-gallery-controls]',
    '.gallery-hint',
    '.gallery-thumbnails',
    '.product-information',
    '.product-secondary',
    '[data-share]',
    '.brand-logo',
    '.site-footer',
  ];
  const label = (node) => {
    if (!node) return null;
    const element = node.nodeType === 1 ? node : node.parentElement;
    return (
      element &&
      element.tagName.toLowerCase() +
        (element.id ? '#' + element.id : '') +
        [...element.classList].map((name) => '.' + name).join('')
    );
  };
  const box = (rect) => rect && {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
  const geometry = () =>
    Object.fromEntries(
      selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        const style = getComputedStyle(element);
        return [
          selector,
          {
            ...box(element.getBoundingClientRect()),
            display: style.display,
            visibility: style.visibility,
            hidden: element.hidden,
            ratio: style.aspectRatio,
            widthAttribute: element.getAttribute('width'),
            heightAttribute: element.getAttribute('height'),
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
          },
        ];
      }),
    );
  const data = (window.__cls = {
    shifts: [],
    snapshots: [],
    mutations: [],
    imageLoads: [],
    snapshot: (name) => data.snapshots.push({name, time: performance.now(), geometry: geometry()}),
  });
  const record = (entries) => {
    for (const entry of entries)
      data.shifts.push({
        time: entry.startTime,
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: (entry.sources || []).map((source) => ({
          node: label(source.node),
          previous: box(source.previousRect),
          current: box(source.currentRect),
        })),
      });
  };
  assertSupport();
  function assertSupport() {
    if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      data.unsupported = true;
      return;
    }
    const observer = new PerformanceObserver((list) => record(list.getEntries()));
    observer.observe({type: 'layout-shift', buffered: true});
    data.flush = () => record(observer.takeRecords());
  }
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target.matches?.('[data-sort-control], [data-gallery-controls], [data-share]')) {
        data.mutations.push({
          time: performance.now(),
          node: label(record.target),
          attribute: record.attributeName,
          hidden: record.target.hidden,
        });
      }
    }
  }).observe(document, {subtree: true, attributes: true, attributeFilter: ['hidden']});
  document.addEventListener(
    'load',
    (event) => {
      if (event.target.matches?.('.hero-visual img, [data-main-image], .brand-logo')) {
        data.imageLoads.push({
          time: performance.now(),
          node: label(event.target),
          geometry: geometry(),
        });
      }
    },
    true,
  );
  document.addEventListener('DOMContentLoaded', () => data.snapshot('dom-content-loaded'));
}

function clsValue(shifts) {
  let maximum = 0;
  let value = 0;
  let first = -Infinity;
  let previous = -Infinity;
  for (const entry of shifts.filter((item) => !item.hadRecentInput)) {
    if (entry.time - previous < 1000 && entry.time - first < 5000) value += entry.value;
    else {
      first = entry.time;
      value = entry.value;
    }
    previous = entry.time;
    maximum = Math.max(maximum, value);
  }
  return maximum;
}

let socket;
const report = {
  completed: false,
  method: 'Chromium PerformanceObserver, CLS maximum session window; no Lighthouse',
  createdAt: new Date().toISOString(),
  repetitions,
  runs: [],
  diagnostics: [],
  delayedAssets: 'Release images 700 ms and JavaScript 1400 ms after first paint',
  sourceHashes: Object.fromEntries(
    [
      'src/site.css',
      'src/site.js',
      'mustache.ts',
      'src/hero.html.mustache',
      'src/product.html.mustache',
      'src/catalog.html.mustache',
    ].map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
  ),
};
try {
  let port;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      break;
    } catch {
      await pause(100);
    }
  }
  assert(port, 'Chrome did not start');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, {resolve, reject});
      socket.send(JSON.stringify({id, method, params}));
    });
  socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    } else listeners.get(message.method)?.(message.params);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      try {
        if (await evaluate(expression)) return;
      } catch {}
      await pause(50);
    }
    throw new Error(`Timeout: ${expression}`);
  };
  for (const domain of ['Page', 'Runtime', 'Network']) await send(`${domain}.enable`);
  await send('Network.setCacheDisabled', {cacheDisabled: true});
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `(${observeLayout})()`});
  report.browser = await send('Browser.getVersion');
  report.node = process.version;
  const devices = [
    {
      name: 'mobile',
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      cpu: 4,
      latency: 150,
      download: 200000,
      upload: 93750,
    },
    {
      name: 'desktop',
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      cpu: 1,
      latency: 40,
      download: 1250000,
      upload: 1250000,
    },
  ];
  report.devices = devices;
  const pages = [
    ['home', '/'],
    ['category', '/kategorie/Hochzeit.html'],
    ['product', '/produkt/holzscheiben/'],
  ];
  const run = async (device, page, delayed, intervention, repetition = 1) => {
    await send('Page.navigate', {url: 'about:blank'});
    await until('location.href === "about:blank"');
    let releasePaint;
    const paintReady = new Promise((resolve) => {
      releasePaint = resolve;
    });
    active = {delayed, hold: intervention?.hold, heroRatio: intervention?.heroRatio, paintReady};
    await send('Emulation.setDeviceMetricsOverride', device);
    await send('Emulation.setCPUThrottlingRate', {rate: device.cpu});
    await send('Network.emulateNetworkConditions', {
      offline: false,
      latency: device.latency,
      downloadThroughput: device.download,
      uploadThroughput: device.upload,
    });
    await send('Network.clearBrowserCache');
    const errors = [];
    listeners.set('Runtime.exceptionThrown', (event) => errors.push(event.exceptionDetails.text));
    listeners.set('Network.responseReceived', (event) => {
      if (event.response.status >= 400)
        errors.push(`${event.response.status}: ${event.response.url}`);
    });
    await send('Page.navigate', {url: base + page[1]});
    const accessibility = async () => {
      const {nodes} = await send('Accessibility.getFullAXTree');
      const exposed = (role, name) =>
        nodes.some(
          (node) => !node.ignored && node.role?.value === role && node.name?.value === name,
        );
      return page[0] === 'product'
        ? {gallery: exposed('button', 'Vorheriges Bild'), share: exposed('button', 'Teilen')}
        : {sort: exposed('combobox', 'Produkte sortieren')};
    };
    let accessibilityBefore;
    if (delayed) {
      await until('performance.getEntriesByType("paint").length > 0');
      await evaluate('window.__cls.snapshot("first-paint")');
      if (args.includes('--assert')) {
        accessibilityBefore = await accessibility();
        assert(
          Object.values(accessibilityBefore).every((value) => !value),
          'Unavailable controls must not appear in the native accessibility tree',
        );
      }
      releasePaint();
    }
    await until('document.readyState === "complete" && !!window.__cls');
    await pause(1000);
    const data = await evaluate(`(()=>{const d=window.__cls;d.flush?.();d.snapshot('settled');
      return {...d, paints:performance.getEntriesByType('paint').map(e=>({name:e.name,time:e.startTime})),
      scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}})()`);
    assert(!data.unsupported, 'Layout Instability API unavailable');
    assert.deepEqual(errors, [], 'Browser errors');
    if (args.includes('--assert') && delayed && !intervention) {
      const initial = data.snapshots.find((snapshot) => snapshot.name === 'first-paint').geometry;
      const settled = data.snapshots.at(-1).geometry;
      for (const selector of [
        '.hero-visual img',
        '.catalog-heading',
        '[data-sort-control]',
        '[data-product-grid]',
        '.gallery-stage',
        '.gallery-hint',
        '.gallery-thumbnails',
        '.product-information',
        '.product-secondary',
        '[data-share]',
      ]) {
        if (!initial[selector]) continue;
        for (const axis of ['x', 'y', 'width', 'height']) {
          assert(
            Math.abs(initial[selector][axis] - settled[selector][axis]) <= 0.5,
            `${device.name}/${page[0]}: ${selector} ${axis} changed before enhancement`,
          );
        }
      }
      for (const selector of ['[data-sort-control]', '[data-gallery-controls]', '[data-share]']) {
        if (!initial[selector]) continue;
        assert.equal(
          initial[selector].visibility,
          'hidden',
          `${selector}: unavailable control exposed`,
        );
        assert.equal(
          settled[selector].visibility,
          'visible',
          `${selector}: enhancement never enabled`,
        );
      }
    }
    const accessibilityAfter = args.includes('--assert') ? await accessibility() : undefined;
    if (accessibilityAfter && !intervention)
      assert(
        Object.values(accessibilityAfter).every(Boolean),
        'Initialized controls must appear in the native accessibility tree',
      );
    const result = {
      device: device.name,
      page: page[0],
      mode: delayed ? 'late-assets' : 'cold',
      repetition,
      intervention,
      cls: clsValue(data.shifts),
      accessibilityBefore,
      accessibilityAfter,
      ...data,
    };
    console.log(
      `${result.device} ${result.page} ${result.mode} ${
        intervention?.name || repetition
      }: CLS ${result.cls.toFixed(6)}`,
    );
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    if (repetition === 1 && !delayed && !intervention) {
      const screenshot = await send('Page.captureScreenshot', {format: 'png'});
      const filename = output.replace(/\.json$/, '') + `-${device.name}-${page[0]}.png`;
      writeFileSync(filename, Buffer.from(screenshot.data, 'base64'));
    }
    return result;
  };
  for (const device of devices) {
    for (const page of pages) {
      for (const delayed of [false, true]) {
        for (let repetition = 1; repetition <= repetitions; repetition++) {
          report.runs.push(await run(device, page, delayed, undefined, repetition));
        }
      }
    }
    if (args.includes('--diagnose')) {
      for (const intervention of [
        {name: 'hold-sort', hold: 'sort', page: pages[0]},
        {name: 'hold-category-sort', hold: 'sort', page: pages[1]},
        {name: 'hero-ratio-only', heroRatio: true, page: pages[0]},
        {name: 'hold-gallery', hold: 'gallery', page: pages[2]},
        {name: 'hold-share', hold: 'share', page: pages[2]},
      ])
        report.diagnostics.push(await run(device, intervention.page, true, intervention));
    }
  }
  report.summary = devices.flatMap((device) =>
    pages.flatMap(([page]) =>
      ['cold', 'late-assets'].map((mode) => {
        const values = report.runs
          .filter((run) => run.device === device.name && run.page === page && run.mode === mode)
          .map((run) => run.cls)
          .sort((a, b) => a - b);
        return {
          device: device.name,
          page,
          mode,
          min: values[0],
          median: values[Math.floor(values.length / 2)],
          max: values.at(-1),
        };
      }),
    ),
  );
  if (args.includes('--assert')) {
    report.noJavaScript = [];
    active = {};
    await send('Emulation.setScriptExecutionDisabled', {value: true});
    for (const device of devices) {
      await send('Emulation.setDeviceMetricsOverride', device);
      for (const page of pages) {
        await send('Page.navigate', {url: base + page[1]});
        await until(
          'document.readyState === "complete" && location.pathname === ' + JSON.stringify(page[1]),
        );
        const noJs =
          await evaluate(`(()=>({marker:document.documentElement.classList.contains('js'),
          products:document.querySelectorAll('[data-product]').length,
          localLinks:[...document.querySelectorAll('[data-thumbnail]')].every(a=>a.getAttribute('href').startsWith('/produkt/')),
          mailto:document.querySelector('[data-contact]').getAttribute('href').startsWith('mailto:'),
          controls:[...document.querySelectorAll('[data-sort-control], [data-gallery-controls], [data-share]')]
            .map(element=>({hidden:element.hidden,display:getComputedStyle(element).display}))}))()`);
        assert.equal(noJs.marker, false, 'JS marker must be absent with scripting disabled');
        assert(noJs.mailto && noJs.localLinks);
        if (page[0] !== 'product') assert(noJs.products > 0);
        assert(noJs.controls.every((control) => control.hidden && control.display === 'none'));
        report.noJavaScript.push({device: device.name, page: page[0], ...noJs});
      }
    }
    await send('Emulation.setScriptExecutionDisabled', {value: false});
  }
  if (args.includes('--assert')) {
    for (const run of report.runs)
      assert(run.cls < 0.05, `${run.device}/${run.page}/${run.mode}: ${run.cls}`);
  }
  report.completed = true;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
  await Promise.race([send('Browser.close'), pause(1000)]);
} catch (error) {
  report.error = String(error.stack || error);
  throw error;
} finally {
  // Retain measured results even if a later run fails.
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
