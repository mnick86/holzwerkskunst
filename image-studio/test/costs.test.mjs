import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateUsdCost,
  createCostEstimator,
  createExchangeRateProvider,
  parseExchangeRate,
  RATE_URL,
} from '../public/costs.mjs';

const close = (actual, expected) =>
  assert(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const analysisModel = 'gpt-5.6-terra';
const imageModel = 'gpt-image-2.5-sunburst';
const usage = {input_tokens: 1000, output_tokens: 200};
const ratePayload = {date: '2026-10-29', base: 'USD', quote: 'EUR', rate: 0.89847};

test('analysis subtracts cached reads and writes; reasoning output is already included', () => {
  const cost = calculateUsdCost('analyze', analysisModel, {
    ...usage,
    input_tokens_details: {
      cached_tokens: 100,
      cache_write_tokens: 300,
      cache_write_tokens_details: {ttl_30m_tokens: 200, ttl_12h_tokens: 100},
    },
    output_tokens_details: {reasoning_tokens: 150},
  });
  // 600 ordinary, 100 cached, 200 short writes, 100 long writes, 200 output.
  close(cost.usd, (600 * 2 + 100 * 0.2 + 200 * 2 * 1.25 + 100 * 2 * 2.5 + 200 * 12) / 1e6);
  close(calculateUsdCost('analyze', analysisModel, usage).usd, 0.0044);
});

test('long-context pricing applies above the documented threshold', () => {
  close(
    calculateUsdCost('analyze', analysisModel, {input_tokens: 272000, output_tokens: 1000}).usd,
    0.556,
  );
  close(
    calculateUsdCost('analyze', analysisModel, {input_tokens: 272001, output_tokens: 1000}).usd,
    1.106004,
  );
});

test('direct image edits price text input, image input, and image output separately without cache discounts', () => {
  const imageUsage = {
    input_tokens: 1100,
    output_tokens: 2000,
    input_tokens_details: {text_tokens: 100, image_tokens: 1000, cached_tokens: 500},
  };
  close(calculateUsdCost('generate', imageModel, imageUsage).usd, 0.0685);
  close(
    calculateUsdCost('generate', imageModel, {
      ...imageUsage,
      output_tokens_details: {image_tokens: 2000, text_tokens: 0},
    }).usd,
    0.0685,
  );
  assert.equal(
    calculateUsdCost('generate', imageModel, {
      ...imageUsage,
      output_tokens_details: {image_tokens: 1900, text_tokens: 100},
    }).status,
    'unavailable',
  );
});

test('unsupported models, pricing tiers, and incomplete or inconsistent usage remain unknown', () => {
  for (const result of [
    calculateUsdCost('analyze', analysisModel),
    calculateUsdCost('analyze', 'custom-model', usage),
    calculateUsdCost('analyze', analysisModel, usage, 'priority'),
    calculateUsdCost('analyze', analysisModel, {...usage, input_tokens: -1}),
    calculateUsdCost('analyze', analysisModel, {
      ...usage,
      input_tokens_details: {cached_tokens: 1001},
    }),
    calculateUsdCost('analyze', analysisModel, {
      ...usage,
      input_tokens_details: {
        cache_write_tokens: 5,
        cache_write_tokens_details: {ttl_30m_tokens: 1, ttl_12h_tokens: 1},
      },
    }),
    calculateUsdCost('generate', imageModel, usage),
    calculateUsdCost('generate', imageModel, {
      ...usage,
      input_tokens_details: {text_tokens: 1, image_tokens: 1},
    }),
  ]) {
    assert.equal(result.status, 'unavailable');
    assert.equal(result.usd, null);
    assert.equal(result.eur, null);
  }
});

test('browser exchange rate parsing preserves the USD/EUR direction and rejects malformed data', () => {
  close(parseExchangeRate(ratePayload).usdToEur, 0.89847);
  assert.equal(parseExchangeRate(ratePayload).date, '2026-10-29');
  assert.throws(() => parseExchangeRate({...ratePayload, rate: 0}));
  assert.throws(() => parseExchangeRate({...ratePayload, base: 'EUR'}));
});

test('exchange rates share concurrent fetches, cache successes, and retain a labelled stale rate offline', async () => {
  let now = 1;
  let calls = 0;
  const provider = createExchangeRateProvider({
    now: () => now,
    fetchImpl: async (url, options) => {
      assert.equal(url, RATE_URL);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.headers, undefined);
      if (++calls > 1) throw new Error('offline');
      return new Response(JSON.stringify(ratePayload));
    },
  });
  const results = await Promise.all([provider(), provider(), provider()]);
  assert.equal(calls, 1);
  assert(results.every((rate) => rate.date === '2026-10-29'));
  await provider();
  assert.equal(calls, 1);
  now += 7 * 60 * 60 * 1000;
  assert.equal((await provider()).stale, true);
  assert.equal(calls, 2);
  await provider();
  assert.equal(calls, 2);
});

test('manual conversion makes no external request; failed rates preserve USD without inventing euros', async () => {
  const provider = createExchangeRateProvider({
    manualRate: 0.9,
    fetchImpl: () => {
      throw new Error('must not fetch');
    },
  });
  const estimated = await createCostEstimator(provider)('analyze', analysisModel, usage);
  close(estimated.eur, 0.00396);
  assert.equal(estimated.exchangeRate.source, 'manual');
  let calls = 0;
  const offline = createExchangeRateProvider({
    fetchImpl: async () => {
      calls++;
      throw new Error('offline');
    },
  });
  const dollarOnly = await createCostEstimator(offline)('analyze', analysisModel, usage);
  close(dollarOnly.usd, 0.0044);
  assert.equal(dollarOnly.eur, null);
  assert.equal(dollarOnly.reason, 'exchange_rate_unavailable');
  await offline();
  assert.equal(calls, 1);
  assert.throws(() => createExchangeRateProvider({manualRate: 0}));
});
