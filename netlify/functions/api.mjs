// netlify/functions/api.mjs — StockPulse v2
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// ─── Model pricing (per million tokens, USD) ──────────────────────────────────
const MODEL_PRICING = {
  "claude-opus-4-5":           { input: 15.00, output: 75.00, label: "Claude Opus 4.5" },
  "claude-sonnet-4-20250514":  { input: 3.00,  output: 15.00, label: "Claude Sonnet 4" },
  "claude-haiku-4-5-20251001": { input: 0.80,  output: 4.00,  label: "Claude Haiku 4.5" },
};
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function calcCost(inputTokens, outputTokens, model) {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  return parseFloat(((inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output).toFixed(6));
}

// ─── Yahoo Finance ─────────────────────────────────────────────────────────────
async function fetchStockData(symbol) {
  const h = { "User-Agent": "Mozilla/5.0" };
  const [chartRes, infoRes] = await Promise.all([
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`, { headers: h }),
    fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,price,defaultKeyStatistics,assetProfile`, { headers: h }),
  ]);
  const [chart, info] = await Promise.all([chartRes.json(), infoRes.json()]);
  const r = info?.quoteSummary?.result?.[0] || {};
  const price = r.price || {}, summary = r.summaryDetail || {}, stats = r.defaultKeyStatistics || {}, profile = r.assetProfile || {};
  const closes = (chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Boolean);
  const changes = closes.slice(1).map((c, i) => parseFloat(((c - closes[i]) / closes[i] * 100).toFixed(2)));
  return {
    symbol, name: price.longName || price.shortName || symbol,
    current_price: price.regularMarketPrice?.raw, previous_close: price.regularMarketPreviousClose?.raw,
    open: price.regularMarketOpen?.raw, day_high: price.regularMarketDayHigh?.raw, day_low: price.regularMarketDayLow?.raw,
    volume: price.regularMarketVolume?.raw, avg_volume: price.averageDailyVolume3Month?.raw,
    market_cap: price.marketCap?.raw, pe_ratio: summary.trailingPE?.raw, forward_pe: summary.forwardPE?.raw,
    eps: stats.trailingEps?.raw, dividend_yield: summary.dividendYield?.raw, beta: summary.beta?.raw,
    week52_high: summary.fiftyTwoWeekHigh?.raw, week52_low: summary.fiftyTwoWeekLow?.raw,
    fifty_day_avg: summary.fiftyDayAverage?.raw, two_hundred_day_avg: summary.twoHundredDayAverage?.raw,
    sector: profile.sector, industry: profile.industry,
    change_percent: price.regularMarketChangePercent?.raw,
    price_changes_30d: changes.slice(-20), fetched_at: new Date().toISOString(),
  };
}

async function searchYahooSymbols(query) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();
    return (data?.quotes || []).filter(q => q.quoteType === "EQUITY" || q.quoteType === "ETF")
      .map(q => ({ symbol: q.symbol, name: q.longname || q.shortname || q.symbol, type: q.quoteType, exchange: q.exchDisp }));
  } catch { return []; }
}

// ─── Blob helpers ──────────────────────────────────────────────────────────────
const stocksStore  = () => getStore("stocks");
const promptsStore = () => getStore("prompts");
const runsStore    = () => getStore("runs");
const resultsStore = () => getStore("results");
const cacheStore   = () => getStore("stock-cache");
const settingsStore= () => getStore("settings");

async function listAll(store) {
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" }).catch(() => null)))).filter(Boolean);
}
async function nextId(store) {
  const items = await listAll(store);
  return items.length ? Math.max(...items.map(i => i.id || 0)) + 1 : 1;
}
async function getSettings() {
  return await settingsStore().get("global", { type: "json" }).catch(() => null) || { model: DEFAULT_MODEL };
}
async function saveSettings(data) { await settingsStore().setJSON("global", data); return data; }

// ─── Default prompts ───────────────────────────────────────────────────────────
const DEFAULT_PROMPTS = [
  { id: 1, name: "Daily Market Summary", description: "Signal, trend, momentum, risk snapshot",
    prompt_text: "Analyze the provided stock data and return a structured assessment. Focus on: current price momentum, volume trends vs average, 52-week range position, and a trading signal. Be concise and data-driven.",
    output_schema: { type: "object", properties: {
      signal: { type: "string", enum: ["BUY","HOLD","SELL","WATCH"] },
      confidence: { type: "number", description: "Confidence 0-100" },
      price_trend: { type: "string", enum: ["BULLISH","BEARISH","NEUTRAL"] },
      momentum_score: { type: "number", description: "Momentum -100 to 100" },
      key_insight: { type: "string", description: "One key insight in 1-2 sentences" },
      risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH"] },
    }, required: ["signal","confidence","price_trend","momentum_score","key_insight","risk_level"] },
    active: 1, created_at: new Date().toISOString() },
  { id: 2, name: "Fundamental Health", description: "Valuation, P/E, growth, dividend quality",
    prompt_text: "Analyze the fundamental health of this stock. Evaluate valuation vs sector, P/E ratio quality, growth trajectory from EPS and revenue signals, dividend sustainability.",
    output_schema: { type: "object", properties: {
      valuation: { type: "string", enum: ["UNDERVALUED","FAIR","OVERVALUED"] },
      fundamental_score: { type: "number", description: "Score 0-100" },
      pe_assessment: { type: "string", description: "P/E assessment in one sentence" },
      growth_outlook: { type: "string", enum: ["STRONG","MODERATE","WEAK","NEGATIVE"] },
      dividend_quality: { type: "string", enum: ["EXCELLENT","GOOD","FAIR","NONE"] },
      summary: { type: "string", description: "2-3 sentence summary" },
    }, required: ["valuation","fundamental_score","pe_assessment","growth_outlook","dividend_quality","summary"] },
    active: 1, created_at: new Date().toISOString() },
  { id: 3, name: "Volatility Analysis", description: "Volatility, 52W position, entry risk",
    prompt_text: "Perform a technical volatility analysis. Assess 52-week range position, beta vs market, recent daily change patterns, and volume anomalies. Rate entry risk.",
    output_schema: { type: "object", properties: {
      volatility_level: { type: "string", enum: ["VERY_LOW","LOW","MODERATE","HIGH","EXTREME"] },
      volatility_score: { type: "number", description: "Score 0-100" },
      week52_position: { type: "string", enum: ["NEAR_LOW","LOWER_HALF","MIDDLE","UPPER_HALF","NEAR_HIGH"] },
      trend_strength: { type: "number", description: "Trend strength 0-100" },
      entry_risk: { type: "string", enum: ["LOW","MEDIUM","HIGH","VERY_HIGH"] },
      technical_notes: { type: "string", description: "Key technical observation" },
    }, required: ["volatility_level","volatility_score","week52_position","trend_strength","entry_risk","technical_notes"] },
    active: 1, created_at: new Date().toISOString() },
];

async function ensureDefaultPrompts() {
  const store = promptsStore();
  if (!(await listAll(store)).length) await Promise.all(DEFAULT_PROMPTS.map(p => store.setJSON(String(p.id), p)));
}

// ─── AI Analysis ───────────────────────────────────────────────────────────────
async function runAIAnalysis(stockData, promptText, outputSchema, model) {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });
  const { price_changes_30d, ...stockForAI } = stockData;
  const response = await client.messages.create({
    model: model || DEFAULT_MODEL, max_tokens: 1000,
    system: `You are a professional stock analyst. Return ONLY valid JSON matching this schema:\n\n${JSON.stringify(outputSchema, null, 2)}\n\nReturn ONLY the JSON object, no markdown.`,
    messages: [{ role: "user", content: `Analyze this stock:\n\n${JSON.stringify(stockForAI, null, 2)}\n\nContext: ${promptText}` }],
  });
  const { input_tokens: inputTokens = 0, output_tokens: outputTokens = 0 } = response.usage || {};
  let raw = response.content[0].text.trim();
  if (raw.includes("```")) { raw = raw.split("```")[1]; if (raw.startsWith("json")) raw = raw.slice(4); }
  return { result: JSON.parse(raw.trim()), raw, inputTokens, outputTokens, cost: calcCost(inputTokens, outputTokens, model || DEFAULT_MODEL) };
}

// ─── Run Execution ─────────────────────────────────────────────────────────────
async function executeRun(runType = "manual", opts = {}) {
  const { specificStocks, specificPrompts, targetDate, model } = opts;
  const runId = `run_${Date.now()}`;
  const settings = await getSettings();
  const activeModel = model || settings.model || DEFAULT_MODEL;
  const run = { id: runId, run_type: runType, started_at: new Date().toISOString(), completed_at: null, status: "running", stocks_processed: 0, error_message: null, model: activeModel, target_date: targetDate || null, total_input_tokens: 0, total_output_tokens: 0, total_cost: 0 };
  await runsStore().setJSON(runId, run);
  try {
    const allStocks = await listAll(stocksStore());
    const allPrompts = await listAll(promptsStore());
    const stocks = specificStocks ? allStocks.filter(s => specificStocks.includes(s.symbol)) : allStocks;
    const prompts = specificPrompts ? allPrompts.filter(p => specificPrompts.includes(p.id) && p.active) : allPrompts.filter(p => p.active);
    let processed = 0, totalIn = 0, totalOut = 0, totalCost = 0;
    for (const stock of stocks) {
      try {
        const stockData = await fetchStockData(stock.symbol);
        if (targetDate) stockData.target_date = targetDate;
        for (const prompt of prompts) {
          try {
            const { result, raw, inputTokens, outputTokens, cost } = await runAIAnalysis(stockData, prompt.prompt_text, prompt.output_schema, activeModel);
            totalIn += inputTokens; totalOut += outputTokens; totalCost += cost;
            await resultsStore().setJSON(`${runId}_${stock.symbol}_${prompt.id}`, { id: `${runId}_${stock.symbol}_${prompt.id}`, run_id: runId, stock_symbol: stock.symbol, prompt_id: prompt.id, prompt_name: prompt.name, stock_data: stockData, structured_output: result, raw_response: raw, input_tokens: inputTokens, output_tokens: outputTokens, cost, model: activeModel, created_at: new Date().toISOString(), target_date: targetDate || null });
          } catch (e) { console.error(`✗ ${stock.symbol}/${prompt.name}:`, e.message); }
        }
        processed++;
      run.progress_percent = Math.round((processed/stocks.length)*100);
      await runsStore().setJSON(runId, run);
    } catch (e) { console.error(`✗ ${stock.symbol}:`, e.message); }
    }
    run.status = "completed"; run.completed_at = new Date().toISOString(); run.stocks_processed = processed;
    run.total_input_tokens = totalIn; run.total_output_tokens = totalOut; run.total_cost = parseFloat(totalCost.toFixed(6));
    await runsStore().setJSON(runId, run);
  } catch (e) {
    run.status = "failed"; run.completed_at = new Date().toISOString(); run.error_message = e.message;
    await runsStore().setJSON(runId, run);
  }
  return runId;
}

async function estimateRunCost(stockCount, promptCount, model) {
  const allResults = (await listAll(resultsStore())).filter(r => r.cost > 0);
  const allRuns = (await listAll(runsStore())).filter(r => r.status === "completed" && r.total_cost > 0);
  if (!allResults.length) {
    const pairs = stockCount * promptCount;
    return { estimated_cost: parseFloat((calcCost(800 * pairs, 200 * pairs, model)).toFixed(4)), estimated_tokens: 1000 * pairs, estimated_seconds: 8 * pairs, confidence: "low", based_on: 0 };
  }
  const avgCost = allResults.reduce((s, r) => s + r.cost, 0) / allResults.length;
  const avgTokens = allResults.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0) / allResults.length;
  const baseModel = allResults[0]?.model || DEFAULT_MODEL;
  const bp = MODEL_PRICING[baseModel] || MODEL_PRICING[DEFAULT_MODEL];
  const tp = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const priceRatio = (tp.input + tp.output) / (bp.input + bp.output);
  const avgSecs = allRuns.length ? allRuns.reduce((s, r) => s + (new Date(r.completed_at) - new Date(r.started_at)) / 1000 / Math.max(r.stocks_processed * 3, 1), 0) / allRuns.length : 8;
  const pairs = stockCount * promptCount;
  return { estimated_cost: parseFloat((avgCost * pairs * priceRatio).toFixed(4)), estimated_tokens: Math.round(avgTokens * pairs), estimated_seconds: Math.round(avgSecs * pairs), confidence: allRuns.length >= 3 ? "high" : "medium", based_on: allRuns.length };
}

async function generatePromptSuggestions(existingPrompts, recentResults, model) {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: model || DEFAULT_MODEL, max_tokens: 3000,
    system: "You are an expert in financial AI prompt engineering. Return ONLY valid JSON with a 'suggestions' array. No markdown.",
    messages: [{ role: "user", content: `Improve this AI stock analysis system.\n\nCurrent prompts:\n${existingPrompts.map(p => `- "${p.name}": ${p.description}`).join("\n")}\n\nRecent results sample:\n${recentResults.slice(0, 5).map(r => `${r.stock_symbol}/${r.prompt_name}: ${JSON.stringify(r.structured_output).slice(0, 150)}`).join("\n")}\n\nGenerate 4 suggestions (mix of improvements to existing and brand new ideas). Each must have: type ("improve"|"new"), target_prompt (name or null), name, description, prompt_text, output_schema (valid JSON schema), pros (array of 3), cons (array of 2), rationale.\n\nReturn: { "suggestions": [...] }` }],
  });
  const { input_tokens: i = 0, output_tokens: o = 0 } = response.usage || {};
  let raw = response.content[0].text.trim();
  if (raw.includes("```")) { raw = raw.split("```")[1]; if (raw.startsWith("json")) raw = raw.slice(4); }
  return { suggestions: JSON.parse(raw.trim()).suggestions || [], cost: calcCost(i, o, model || DEFAULT_MODEL) };
}

// ─── JSON helper ───────────────────────────────────────────────────────────────
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } }); }

// ─── Routes ────────────────────────────────────────────────────────────────────
async function handleRequest(req, path, method, body) {
  await ensureDefaultPrompts();

  if (path === "/api/settings" && method === "GET") return json(await getSettings());
  if (path === "/api/settings" && method === "PUT") return json(await saveSettings(body));
  if (path === "/api/models" && method === "GET") return json(Object.entries(MODEL_PRICING).map(([id, info]) => ({ id, label: info.label, input_per_mtok: info.input, output_per_mtok: info.output })));

  if (path === "/api/stocks/search" && method === "GET") {
    const q = new URL(req.url).searchParams.get("q") || "";
    return json(q.length < 1 ? [] : await searchYahooSymbols(q));
  }
  if (path === "/api/stocks" && method === "GET") return json((await listAll(stocksStore())).sort((a, b) => a.symbol.localeCompare(b.symbol)));
  if (path === "/api/stocks" && method === "POST") {
    const symbol = (body?.symbol || "").toUpperCase().trim();
    if (!symbol) return json({ error: "Symbol required" }, 400);
    try {
      const data = await fetchStockData(symbol);
      const store = stocksStore();
      if (!await store.get(symbol, { type: "json" }).catch(() => null)) await store.setJSON(symbol, { id: symbol, symbol, name: data.name || symbol, added_at: new Date().toISOString() });
      return json({ symbol, name: data.name, data });
    } catch (e) { return json({ error: e.message }, 400); }
  }
  const sDelM = path.match(/^\/api\/stocks\/([A-Z0-9.]+)$/);
  if (sDelM && method === "DELETE") { await stocksStore().delete(sDelM[1]); return json({ deleted: sDelM[1] }); }
  const sDataM = path.match(/^\/api\/stocks\/([A-Z0-9.]+)\/data$/);
  if (sDataM && method === "GET") {
    try {
      const sym = sDataM[1];
      const cached = await cacheStore().get(sym, { type: "json" }).catch(() => null);
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 5 * 60 * 1000) return json(cached);
      const data = await fetchStockData(sym);
      await cacheStore().setJSON(sym, data);
      return json(data);
    } catch (e) { return json({ error: e.message }, 400); }
  }

  if (path === "/api/prompts" && method === "GET") return json((await listAll(promptsStore())).sort((a, b) => a.id - b.id));
  if (path === "/api/prompts" && method === "POST") {
    const store = promptsStore();
    const id = await nextId(store);
    const p = { id, name: body.name, description: body.description || "", prompt_text: body.prompt_text, output_schema: body.output_schema, active: 1, created_at: new Date().toISOString() };
    await store.setJSON(String(id), p);
    return json(p);
  }
  const pM = path.match(/^\/api\/prompts\/(\d+)$/);
  if (pM && method === "PUT") { await promptsStore().setJSON(pM[1], { ...body, id: parseInt(pM[1]) }); return json({ updated: pM[1] }); }
  if (pM && method === "DELETE") { await promptsStore().delete(pM[1]); return json({ deleted: pM[1] }); }

  if (path === "/api/runs" && method === "POST") {
    const settings = await getSettings();
    executeRun("manual", { specificStocks: body?.stocks, specificPrompts: body?.prompts, targetDate: body?.target_date, model: body?.model || settings.model }).catch(console.error);
    return json({ status: "started" });
  }
  if (path === "/api/runs" && method === "GET") return json((await listAll(runsStore())).sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, 50));
  if (path === "/api/runs/latest" && method === "GET") {
    const runs = (await listAll(runsStore())).filter(r => r.status === "completed").sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    if (!runs.length) return json(null);
    const results = (await listAll(resultsStore())).filter(r => r.run_id === runs[0].id).sort((a, b) => a.stock_symbol.localeCompare(b.stock_symbol));
    return json({ run: runs[0], results });
  }
  if (path === "/api/runs/estimate" && method === "POST") {
    const settings = await getSettings();
    return json(await estimateRunCost(body?.stock_count || 1, body?.prompt_count || 1, body?.model || settings.model));
  }
  if (path === "/api/runs/retroactive" && method === "POST") {
    const { from_date, to_date, model } = body || {};
    if (!from_date || !to_date) return json({ error: "from_date and to_date required" }, 400);
    const settings = await getSettings();
    const activeModel = model || settings.model;
    const dates = [];
    const cur = new Date(from_date), end = new Date(to_date);
    while (cur <= end) { const d = cur.getDay(); if (d !== 0 && d !== 6) dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
    if (!dates.length) return json({ error: "No trading days in range" }, 400);
    if (dates.length > 30) return json({ error: "Max 30 trading days" }, 400);
    const allStocks = await listAll(stocksStore());
    const allPrompts = (await listAll(promptsStore())).filter(p => p.active);
    const estimate = await estimateRunCost(allStocks.length, allPrompts.length, activeModel);
    (async () => { for (const date of dates) { await executeRun("retroactive", { targetDate: date, model: activeModel }); await new Promise(r => setTimeout(r, 500)); } })().catch(console.error);
    return json({ status: "started", days: dates.length, total_estimated_cost: parseFloat((estimate.estimated_cost * dates.length).toFixed(4)), total_estimated_seconds: estimate.estimated_seconds * dates.length });
  }
  const cancelM = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (cancelM && method === "POST") {
    let r = await runsStore().get(cancelM[1], { type: "json" });
    if (r) { r.status = "cancelled"; await runsStore().setJSON(cancelM[1], r); return Response.json({ success: true }); }
  }
  const runM = path.match(/^\/api\/runs\/([^/]+)$/);
  if (runM && method === "GET") {
    const run = await runsStore().get(runM[1], { type: "json" }).catch(() => null);
    if (!run) return json({ error: "Not found" }, 404);
    const results = (await listAll(resultsStore())).filter(r => r.run_id === runM[1]).sort((a, b) => a.stock_symbol.localeCompare(b.stock_symbol));
    return json({ run, results });
  }

  if (path === "/api/statistics" && method === "GET") {
    const allResults = await listAll(resultsStore());
    const allRuns = await listAll(runsStore());
    const completedIds = new Set(allRuns.filter(r => r.status === "completed").map(r => r.id));
    const completed = allResults.filter(r => completedIds.has(r.run_id));
    const sig = {}, trend = {}, risk = {}, val = {}, confByStock = {}, fundByStock = {}, volByStock = {}, sigTime = {}, latest = {}, costByPrompt = {};
    let totalCost = 0, totalTokens = 0;
    for (const r of completed) {
      const out = r.structured_output, sym = r.stock_symbol, date = r.created_at?.slice(0, 10);
      if (out.signal) sig[out.signal] = (sig[out.signal] || 0) + 1;
      if (out.price_trend) trend[out.price_trend] = (trend[out.price_trend] || 0) + 1;
      if (out.risk_level) risk[out.risk_level] = (risk[out.risk_level] || 0) + 1;
      if (out.valuation) val[out.valuation] = (val[out.valuation] || 0) + 1;
      if (out.confidence != null) { confByStock[sym] = confByStock[sym] || []; confByStock[sym].push(out.confidence); }
      if (out.fundamental_score != null) { fundByStock[sym] = fundByStock[sym] || []; fundByStock[sym].push(out.fundamental_score); }
      if (out.volatility_score != null) { volByStock[sym] = volByStock[sym] || []; volByStock[sym].push(out.volatility_score); }
      if (out.signal && date) { sigTime[date] = sigTime[date] || {}; sigTime[date][out.signal] = (sigTime[date][out.signal] || 0) + 1; }
      if (out.signal && r.prompt_name === "Daily Market Summary" && !latest[sym]) latest[sym] = { signal: out.signal, confidence: out.confidence, date };
      const cost = r.cost || 0; totalCost += cost; totalTokens += (r.input_tokens || 0) + (r.output_tokens || 0);
      costByPrompt[r.prompt_name] = (costByPrompt[r.prompt_name] || 0) + cost;
    }
    const avg = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, parseFloat((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1))]));
    const runCounts = {}; for (const r of allRuns.filter(r => r.status === "completed")) runCounts[r.run_type] = (runCounts[r.run_type] || 0) + 1;
    return json({ signal_distribution: sig, trend_distribution: trend, risk_distribution: risk, valuation_distribution: val, avg_confidence_by_stock: avg(confByStock), avg_fundamental_by_stock: avg(fundByStock), avg_volatility_by_stock: avg(volByStock), signal_over_time: Object.entries(sigTime).sort().map(([date, v]) => ({ date, ...v })), run_counts: runCounts, total_analyses: completed.length, latest_signals: latest, total_stocks_tracked: Object.keys(confByStock).length, total_cost: parseFloat(totalCost.toFixed(4)), total_tokens: totalTokens, cost_by_prompt: Object.fromEntries(Object.entries(costByPrompt).map(([k, v]) => [k, parseFloat(v.toFixed(4))])) });
  }

  if (path === "/api/suggestions" && method === "POST") {
    try {
      const settings = await getSettings();
      const prompts = await listAll(promptsStore());
      const allResults = (await listAll(resultsStore())).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
      return json(await generatePromptSuggestions(prompts, allResults, body?.model || settings.model));
    } catch (e) { return json({ error: e.message }, 500); }
  }

  if (path === "/api/health" && method === "GET") {
    const settings = await getSettings();
    return json({ status: "ok", time: new Date().toISOString(), api_key_set: !!Netlify.env.get("ANTHROPIC_API_KEY"), model: settings.model });
  }
  if (path === "/api/health/anthropic" && method === "GET") {
    try { const client = new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY") }); await client.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }); return json({ ok: true }); }
    catch (e) { return json({ ok: false, error: e.message }, 503); }
  }
  return json({ error: "Not found" }, 404);
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace("/.netlify/functions/api", "");
  const method = req.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { headers: CORS });
  let body = null;
  if (["POST","PUT","PATCH"].includes(method)) try { body = await req.json(); } catch (_) {}
  try { return await handleRequest(req, path || "/api/health", method, body); }
  catch (e) { console.error("API error:", e); return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } }); }
};
export const config = { path: "/api/*" };
