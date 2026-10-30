// Standard, non-batch API prices in USD per million tokens, checked 2026-10-30.
// Sources: https://developers.openai.com/api/docs/models/gpt-5.6-terra
// https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
// https://developers.openai.com/api/docs/guides/prompt-caching
export const PRICING_DATE = '2026-10-30';
// CORS-enabled public ECB reference rates, no credentials sent.
export const RATE_URL = 'https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ecb';
const ANALYSIS_PRICES = new Map([['gpt-5.6-terra', {input: 2, cached: 0.2, output: 12}]]);
const IMAGE_MODELS = new Set([
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-sunburst-2026-09-08',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-flare-2026-09-08',
]);

const count = (value) => Number.isSafeInteger(value) && value >= 0;

export function unavailableCost(model, reason = 'usage_missing') {
  return {
    status: 'unavailable',
    reason,
    model,
    usd: null,
    eur: null,
    usage: null,
    pricingDate: PRICING_DATE,
  };
}

export function parseExchangeRate(payload) {
  if (
    payload?.base !== 'USD' ||
    payload?.quote !== 'EUR' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.date) ||
    !Number.isFinite(payload.rate) ||
    payload.rate <= 0
  )
    throw new Error('Invalid exchange rate');
  return {usdToEur: payload.rate, date: payload.date, source: 'frankfurter', stale: false};
}

export function createExchangeRateProvider({manualRate, fetchImpl = fetch, now = Date.now} = {}) {
  if (manualRate !== undefined && (!Number.isFinite(manualRate) || manualRate <= 0)) {
    throw new Error('Der USD/EUR-Kurs muss größer als 0 sein.');
  }
  let cached = null;
  let nextRefresh = 0;
  let pending;
  return async () => {
    if (manualRate !== undefined)
      return {usdToEur: manualRate, source: 'manual', date: null, stale: false};
    if (now() < nextRefresh) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetchImpl(RATE_URL, {
          signal: AbortSignal.timeout(5000),
          mode: 'cors',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
        });
        if (!response.ok) throw new Error('ECB unavailable');
        cached = parseExchangeRate(await response.json());
        nextRefresh = now() + 6 * 60 * 60 * 1000;
      } catch {
        if (cached) cached = {...cached, stale: true};
        nextRefresh = now() + 5 * 60 * 1000;
      }
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

export function calculateUsdCost(action, model, usage, serviceTier) {
  if (!usage || !count(usage.input_tokens) || !count(usage.output_tokens))
    return unavailableCost(model);
  if (serviceTier && !['default', 'standard'].includes(serviceTier))
    return unavailableCost(model, 'service_tier_unknown');
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  let usd;
  let breakdown;
  if (action === 'analyze') {
    const prices = ANALYSIS_PRICES.get(model);
    if (!prices) return unavailableCost(model, 'model_price_unknown');
    const details = usage.input_tokens_details || {};
    const cached = details.cached_tokens ?? 0;
    const writeDetails = details.cache_write_tokens_details;
    const writes =
      details.cache_write_tokens ??
      (writeDetails ? writeDetails.ttl_30m_tokens + writeDetails.ttl_12h_tokens : 0);
    const write30 = writeDetails?.ttl_30m_tokens ?? writes;
    const write12 = writeDetails?.ttl_12h_tokens ?? 0;
    if (
      ![cached, writes, write30, write12].every(count) ||
      write30 + write12 !== writes ||
      cached + writes > input
    ) {
      return unavailableCost(model, 'usage_incomplete');
    }
    const ordinary = input - cached - writes;
    const longContext = input > 272_000;
    usd =
      ((ordinary * prices.input +
        cached * prices.cached +
        write30 * prices.input * 1.25 +
        write12 * prices.input * 2.5) *
        (longContext ? 2 : 1) +
        output * prices.output * (longContext ? 1.5 : 1)) /
      1_000_000;
    breakdown = {
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
      cacheWrite30mTokens: write30,
      cacheWrite12hTokens: write12,
    };
  } else {
    if (!IMAGE_MODELS.has(model)) return unavailableCost(model, 'model_price_unknown');
    const text = usage.input_tokens_details?.text_tokens;
    const image = usage.input_tokens_details?.image_tokens;
    const imageOutput = usage.output_tokens_details?.image_tokens ?? output;
    const textOutput = usage.output_tokens_details?.text_tokens ?? 0;
    if (
      ![text, image, imageOutput, textOutput].every(count) ||
      text + image !== input ||
      imageOutput + textOutput !== output ||
      textOutput !== 0
    ) {
      return unavailableCost(model, 'usage_incomplete');
    }
    // Direct /images/edits requests do not receive cached-input pricing.
    usd = (text * 5 + image * 8 + imageOutput * 30) / 1_000_000;
    breakdown = {
      inputTokens: input,
      outputTokens: output,
      textInputTokens: text,
      imageInputTokens: image,
      imageOutputTokens: imageOutput,
    };
  }
  return {status: 'estimated', model, usd, eur: null, usage: breakdown, pricingDate: PRICING_DATE};
}

export function createCostEstimator(exchangeRateProvider) {
  return async (action, model, usage, serviceTier) => {
    const cost = calculateUsdCost(action, model, usage, serviceTier);
    if (cost.status !== 'estimated') return cost;
    let rate;
    try {
      rate = await exchangeRateProvider();
    } catch {}
    if (!rate || !Number.isFinite(rate.usdToEur) || rate.usdToEur <= 0) {
      return {...cost, reason: 'exchange_rate_unavailable'};
    }
    return {...cost, eur: cost.usd * rate.usdToEur, exchangeRate: rate};
  };
}
