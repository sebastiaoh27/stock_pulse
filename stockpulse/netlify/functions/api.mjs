// netlify/functions/api.mjs
// Handles all /api/* routes. Replaces the Flask backend entirely.
// Storage: Netlify Blobs (persistent, free, built-in)
// AI: Anthropic SDK (same as before)
// Stock data: Yahoo Finance v8 API via fetch

import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// ─── Yahoo Finance ────────────────────────────────────────────────────────────

async function fetchStockData(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
  const infoUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,price,defaultKeyStatistics,assetProfile`;

  const [chartRes, infoRes] = await Promise.all([
    fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }),
    fetch(infoUrl, { headers: { "User-Agent": "Mozilla/5.0" } }),
  ]);

  const [chart, info] = await Promise.all([chartRes.json(), infoRes.json()]);

  const result = info?.quoteSummary?.result?.[0] || {};
  const price = result.price || {};
  const summary = result.summaryDetail || {};
  const stats = result.defaultKeyStatistics || {};
  const profile = result.assetProfile || {};

  const closes = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter((c) => c != null);
  const changes = validCloses
    .slice(1)
    .map((c, i) => parseFloat(((c - validCloses[i]) / validCloses[i] * 100).toFixed(2)));

  return {
    symbol,
    name: price.longName || price.shortName || symbol,
    current_price: price.regularMarketPrice?.raw,
    previous_close: price.regularMarketPreviousClose?.raw,
    open: price.regularMarketOpen?.raw,
    day_high: price.regularMarketDayHigh?.raw,
    day_low: price.regularMarketDayLow?.raw,
    volume: price.regularMarketVolume?.raw,
    avg_volume: price.averageDailyVolume3Month?.raw,
    market_cap: price.marketCap?.raw,
    pe_ratio: summary.trailingPE?.raw,
    forward_pe: summary.forwardPE?.raw,
    eps: stats.trailingEps?.raw,
    dividend_yield: summary.dividendYield?.raw,
    beta: summary.beta?.raw,
    week52_high: summary.fiftyTwoWeekHigh?.raw,
    week52_low: summary.fiftyTwoWeekLow?.raw,
    fifty_day_avg: summary.fiftyDayAverage?.raw,
    two_hundred_day_avg: summary.twoHundredDayAverage?.raw,
    sector: profile.sector,
    industry: profile.industry,
    change_percent: price.regularMarketChangePercent?.raw,
    price_changes_30d: changes.slice(-20),
    fetched_at: new Date().toISOString(),
  };
}

// ─── Blobs DB helpers ─────────────────────────────────────────────────────────
// We use Netlify Blobs as a simple JSON store.
// Stores: "stocks", "prompts", "runs", "results", "cache"

function stocksStore() { return getStore("stocks"); }
function promptsStore() { return getStore("prompts"); }
function runsStore() { return getStore("runs"); }
function resultsStore() { return getStore("results"); }
function cacheStore() { return getStore("stock-cache"); }

async function listAll(store) {
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map(async (b) => {
    const val = await store.get(b.key, { type: "json" });
    return val;
  }));
  return items.filter(Boolean);
}

async function nextId(store) {
  const items = await listAll(store);
  if (!items.length) return 1;
  return Math.max(...items.map((i) => i.id || 0)) + 1;
}

// ─── Default prompts ──────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = [
  {
    id: 1,
    name: "Daily Market Summary",
    description: "Quick snapshot of stock health and sentiment",
    prompt_text: "Analyze the provided stock data and return a structured assessment. Focus on: current price momentum, volume trends, and a brief trading signal. Be concise and data-driven.",
    output_schema: {
      type: "object",
      properties: {
        signal: { type: "string", enum: ["BUY", "HOLD", "SELL", "WATCH"] },
        confidence: { type: "number", description: "Confidence 0-100" },
        price_trend: { type: "string", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
        momentum_score: { type: "number", description: "Momentum score -100 to 100" },
        key_insight: { type: "string", description: "One key insight in 1-2 sentences" },
        risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      },
      required: ["signal", "confidence", "price_trend", "momentum_score", "key_insight", "risk_level"],
    },
    active: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Fundamental Health Check",
    description: "Evaluate P/E, market cap, and fundamental metrics",
    prompt_text: "Analyze the fundamental health of this stock based on the provided data. Evaluate valuation metrics, company size, and overall fundamental strength. Return structured output with specific scores.",
    output_schema: {
      type: "object",
      properties: {
        valuation: { type: "string", enum: ["UNDERVALUED", "FAIR", "OVERVALUED"] },
        fundamental_score: { type: "number", description: "Overall fundamental score 0-100" },
        pe_assessment: { type: "string", description: "P/E ratio assessment in 1 sentence" },
        growth_outlook: { type: "string", enum: ["STRONG", "MODERATE", "WEAK", "NEGATIVE"] },
        dividend_quality: { type: "string", enum: ["EXCELLENT", "GOOD", "FAIR", "NONE"] },
        summary: { type: "string", description: "2-3 sentence fundamental summary" },
      },
      required: ["valuation", "fundamental_score", "pe_assessment", "growth_outlook", "dividend_quality", "summary"],
    },
    active: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    name: "Technical Volatility Analysis",
    description: "Analyze price volatility and technical indicators",
    prompt_text: "Perform a technical volatility analysis on this stock. Look at 52-week range position, recent price change, and beta to assess volatility profile. Return structured analysis.",
    output_schema: {
      type: "object",
      properties: {
        volatility_level: { type: "string", enum: ["VERY_LOW", "LOW", "MODERATE", "HIGH", "EXTREME"] },
        volatility_score: { type: "number", description: "Volatility score 0-100" },
        week52_position: { type: "string", enum: ["NEAR_LOW", "LOWER_HALF", "MIDDLE", "UPPER_HALF", "NEAR_HIGH"] },
        trend_strength: { type: "number", description: "Trend strength 0-100" },
        entry_risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] },
        technical_notes: { type: "string", description: "Key technical observation in 1-2 sentences" },
      },
      required: ["volatility_level", "volatility_score", "week52_position", "trend_strength", "entry_risk", "technical_notes"],
    },
    active: 1,
    created_at: new Date().toISOString(),
  },
];

async function ensureDefaultPrompts() {
  const store = promptsStore();
  const existing = await listAll(store);
  if (existing.length === 0) {
    await Promise.all(DEFAULT_PROMPTS.map((p) => store.setJSON(String(p.id), p)));
  }
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────

async function runAIAnalysis(stockData, promptText, outputSchema) {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Netlify environment variables");

  const client = new Anthropic({ apiKey });
  const schemaStr = JSON.stringify(outputSchema, null, 2);
  const { price_changes_30d, ...stockForAI } = stockData;

  const systemPrompt = `You are a professional stock analyst. Return ONLY valid JSON matching this schema:\n\n${schemaStr}\n\nRules:\n- Return ONLY the JSON object, no markdown, no explanation\n- All required fields must be present\n- Use exact field names and types from the schema`;

  const userMessage = `Analyze this stock and return structured JSON:\n\n${JSON.stringify(stockForAI, null, 2)}\n\nAdditional context:\n${promptText}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  let raw = response.content[0].text.trim();
  if (raw.includes("```")) {
    raw = raw.split("```")[1];
    if (raw.startsWith("json")) raw = raw.slice(4);
  }
  return { result: JSON.parse(raw.trim()), raw };
}

// ─── Run Execution ────────────────────────────────────────────────────────────

async function executeRun(runType = "manual", specificStocks = null, specificPrompts = null) {
  const runId = `run_${Date.now()}`;
  const run = {
    id: runId,
    run_type: runType,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: "running",
    stocks_processed: 0,
    error_message: null,
  };

  const rStore = runsStore();
  await rStore.setJSON(runId, run);

  try {
    const allStocks = await listAll(stocksStore());
    const allPrompts = await listAll(promptsStore());

    const stocks = specificStocks
      ? allStocks.filter((s) => specificStocks.includes(s.symbol))
      : allStocks;
    const prompts = specificPrompts
      ? allPrompts.filter((p) => specificPrompts.includes(p.id) && p.active)
      : allPrompts.filter((p) => p.active);

    let processed = 0;
    const resultStore = resultsStore();

    for (const stock of stocks) {
      try {
        const stockData = await fetchStockData(stock.symbol);
        for (const prompt of prompts) {
          try {
            const { result, raw } = await runAIAnalysis(stockData, prompt.prompt_text, prompt.output_schema);
            const resultId = `${runId}_${stock.symbol}_${prompt.id}`;
            await resultStore.setJSON(resultId, {
              id: resultId,
              run_id: runId,
              stock_symbol: stock.symbol,
              prompt_id: prompt.id,
              prompt_name: prompt.name,
              stock_data: stockData,
              structured_output: result,
              raw_response: raw,
              created_at: new Date().toISOString(),
            });
            console.log(`✓ ${stock.symbol} / ${prompt.name}`);
          } catch (e) {
            console.error(`✗ ${stock.symbol} / ${prompt.name}:`, e.message);
          }
        }
        processed++;
      } catch (e) {
        console.error(`✗ ${stock.symbol}:`, e.message);
      }
    }

    run.status = "completed";
    run.completed_at = new Date().toISOString();
    run.stocks_processed = processed;
    await rStore.setJSON(runId, run);
  } catch (e) {
    run.status = "failed";
    run.completed_at = new Date().toISOString();
    run.error_message = e.message;
    await rStore.setJSON(runId, run);
    console.error("Run failed:", e.message);
  }

  return runId;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function handleRequest(req, path, method, body) {
  await ensureDefaultPrompts();

  // ── Stocks ──────────────────────────────────────────────────────────────
  if (path === "/api/stocks" && method === "GET") {
    const stocks = await listAll(stocksStore());
    return json(stocks.sort((a, b) => a.symbol.localeCompare(b.symbol)));
  }

  if (path === "/api/stocks" && method === "POST") {
    const symbol = (body?.symbol || "").toUpperCase().trim();
    if (!symbol) return json({ error: "Symbol required" }, 400);
    try {
      const data = await fetchStockData(symbol);
      const store = stocksStore();
      const existing = await store.get(symbol, { type: "json" });
      if (!existing) {
        await store.setJSON(symbol, {
          id: symbol,
          symbol,
          name: data.name || symbol,
          added_at: new Date().toISOString(),
        });
      }
      return json({ symbol, name: data.name, data });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  const stockDeleteMatch = path.match(/^\/api\/stocks\/([A-Z.]+)$/);
  if (stockDeleteMatch && method === "DELETE") {
    await stocksStore().delete(stockDeleteMatch[1]);
    return json({ deleted: stockDeleteMatch[1] });
  }

  const stockDataMatch = path.match(/^\/api\/stocks\/([A-Z.]+)\/data$/);
  if (stockDataMatch && method === "GET") {
    try {
      // 5-minute cache
      const sym = stockDataMatch[1];
      const cStore = cacheStore();
      const cached = await cStore.get(sym, { type: "json" });
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 5 * 60 * 1000) {
        return json(cached);
      }
      const data = await fetchStockData(sym);
      await cStore.setJSON(sym, data);
      return json(data);
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  // ── Prompts ─────────────────────────────────────────────────────────────
  if (path === "/api/prompts" && method === "GET") {
    const prompts = await listAll(promptsStore());
    return json(prompts.sort((a, b) => a.id - b.id));
  }

  if (path === "/api/prompts" && method === "POST") {
    const store = promptsStore();
    const id = await nextId(store);
    const prompt = {
      id,
      name: body.name,
      description: body.description || "",
      prompt_text: body.prompt_text,
      output_schema: body.output_schema,
      active: 1,
      created_at: new Date().toISOString(),
    };
    await store.setJSON(String(id), prompt);
    return json(prompt);
  }

  const promptMatch = path.match(/^\/api\/prompts\/(\d+)$/);
  if (promptMatch && method === "PUT") {
    const store = promptsStore();
    const updated = { ...body, id: parseInt(promptMatch[1]) };
    await store.setJSON(promptMatch[1], updated);
    return json({ updated: promptMatch[1] });
  }

  if (promptMatch && method === "DELETE") {
    await promptsStore().delete(promptMatch[1]);
    return json({ deleted: promptMatch[1] });
  }

  // ── Runs ────────────────────────────────────────────────────────────────
  if (path === "/api/runs" && method === "POST") {
    // Fire and forget — return immediately, run in background
    executeRun("manual", body?.stocks || null, body?.prompts || null).catch(console.error);
    return json({ status: "started", message: "Run started" });
  }

  if (path === "/api/runs" && method === "GET") {
    const runs = await listAll(runsStore());
    return json(runs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, 50));
  }

  if (path === "/api/runs/latest" && method === "GET") {
    const runs = await listAll(runsStore());
    const completed = runs
      .filter((r) => r.status === "completed")
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    if (!completed.length) return json(null);
    const run = completed[0];
    const allResults = await listAll(resultsStore());
    const results = allResults
      .filter((r) => r.run_id === run.id)
      .sort((a, b) => a.stock_symbol.localeCompare(b.stock_symbol));
    return json({ run, results });
  }

  const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
  if (runMatch && method === "GET") {
    const run = await runsStore().get(runMatch[1], { type: "json" });
    if (!run) return json({ error: "Not found" }, 404);
    const allResults = await listAll(resultsStore());
    const results = allResults
      .filter((r) => r.run_id === runMatch[1])
      .sort((a, b) => a.stock_symbol.localeCompare(b.stock_symbol));
    return json({ run, results });
  }

  // ── Statistics ──────────────────────────────────────────────────────────
  if (path === "/api/statistics" && method === "GET") {
    const allResults = await listAll(resultsStore());
    const allRuns = await listAll(runsStore());
    const completedRunIds = new Set(allRuns.filter((r) => r.status === "completed").map((r) => r.id));
    const completed = allResults.filter((r) => completedRunIds.has(r.run_id));

    const signal_distribution = {};
    const trend_distribution = {};
    const risk_distribution = {};
    const valuation_distribution = {};
    const confidence_by_stock = {};
    const fundamental_by_stock = {};
    const volatility_by_stock = {};
    const signal_over_time = {};
    const latest_signals = {};

    for (const r of completed) {
      const out = r.structured_output;
      const sym = r.stock_symbol;
      const date = r.created_at?.slice(0, 10);

      if (out.signal) signal_distribution[out.signal] = (signal_distribution[out.signal] || 0) + 1;
      if (out.price_trend) trend_distribution[out.price_trend] = (trend_distribution[out.price_trend] || 0) + 1;
      if (out.risk_level) risk_distribution[out.risk_level] = (risk_distribution[out.risk_level] || 0) + 1;
      if (out.valuation) valuation_distribution[out.valuation] = (valuation_distribution[out.valuation] || 0) + 1;
      if (out.confidence != null) { if (!confidence_by_stock[sym]) confidence_by_stock[sym] = []; confidence_by_stock[sym].push(out.confidence); }
      if (out.fundamental_score != null) { if (!fundamental_by_stock[sym]) fundamental_by_stock[sym] = []; fundamental_by_stock[sym].push(out.fundamental_score); }
      if (out.volatility_score != null) { if (!volatility_by_stock[sym]) volatility_by_stock[sym] = []; volatility_by_stock[sym].push(out.volatility_score); }
      if (out.signal && date) {
        if (!signal_over_time[date]) signal_over_time[date] = {};
        signal_over_time[date][out.signal] = (signal_over_time[date][out.signal] || 0) + 1;
      }
      if (out.signal && r.prompt_name === "Daily Market Summary" && !latest_signals[sym]) {
        latest_signals[sym] = { signal: out.signal, confidence: out.confidence, date };
      }
    }

    const avg = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, parseFloat((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1))]));
    const runCounts = {};
    for (const r of allRuns.filter((r) => r.status === "completed")) {
      runCounts[r.run_type] = (runCounts[r.run_type] || 0) + 1;
    }

    return json({
      signal_distribution,
      trend_distribution,
      risk_distribution,
      valuation_distribution,
      avg_confidence_by_stock: avg(confidence_by_stock),
      avg_fundamental_by_stock: avg(fundamental_by_stock),
      avg_volatility_by_stock: avg(volatility_by_stock),
      signal_over_time: Object.entries(signal_over_time).sort().map(([date, v]) => ({ date, ...v })),
      run_counts: runCounts,
      total_analyses: completed.length,
      latest_signals,
      total_stocks_tracked: Object.keys(confidence_by_stock).length,
    });
  }

  const stockStatsMatch = path.match(/^\/api\/statistics\/stock\/([A-Z.]+)$/);
  if (stockStatsMatch && method === "GET") {
    const sym = stockStatsMatch[1];
    const allResults = await listAll(resultsStore());
    const history = {};
    for (const r of allResults.filter((r) => r.stock_symbol === sym).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100)) {
      if (!history[r.prompt_name]) history[r.prompt_name] = [];
      history[r.prompt_name].push({ output: r.structured_output, date: r.created_at?.slice(0, 10), run_type: r.run_type });
    }
    return json({ symbol: sym, history });
  }

  // ── Health ──────────────────────────────────────────────────────────────
  if (path === "/api/health" && method === "GET") {
    return json({ status: "ok", time: new Date().toISOString(), api_key_set: !!Netlify.env.get("ANTHROPIC_API_KEY") });
  }

  if (path === "/api/health/anthropic" && method === "GET") {
    try {
      const client = new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY") });
      await client.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 5, messages: [{ role: "user", content: "hi" }] });
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: e.message }, 503);
    }
  }

  return json({ error: "Not found" }, 404);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace("/.netlify/functions/api", "");
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  let body = null;
  if (["POST", "PUT", "PATCH"].includes(method)) {
    try { body = await req.json(); } catch (_) {}
  }

  try {
    return await handleRequest(req, path || "/api/health", method, body);
  } catch (e) {
    console.error("API error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};

export const config = {
  path: "/api/*",
};
