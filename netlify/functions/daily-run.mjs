// netlify/functions/daily-run.mjs
// Scheduled function: runs full analysis at 08:00 UTC every day.
// Trigger it manually from Netlify UI: Functions tab → daily-run → Run now

import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// Re-use the same logic as api.mjs
async function fetchStockData(symbol) {
  const infoUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,price,defaultKeyStatistics,assetProfile`;
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;

  const [chartRes, infoRes] = await Promise.all([
    fetch(chartUrl, { headers: { "User-Agent": "Mozilla/5.0" } }),
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
  const changes = validCloses.slice(1).map((c, i) =>
    parseFloat(((c - validCloses[i]) / validCloses[i] * 100).toFixed(2))
  );

  return {
    symbol,
    name: price.longName || price.shortName || symbol,
    current_price: price.regularMarketPrice?.raw,
    previous_close: price.regularMarketPreviousClose?.raw,
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
    change_percent: price.regularMarketChangePercent?.raw,
    price_changes_30d: changes.slice(-20),
    fetched_at: new Date().toISOString(),
  };
}

async function listAll(store) {
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

export default async (req) => {
  const { next_run } = await req.json().catch(() => ({}));
  console.log(`Daily analysis starting. Next run: ${next_run}`);

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    return;
  }

  const client = new Anthropic({ apiKey });
  const stocks = await listAll(getStore("stocks"));
  const prompts = (await listAll(getStore("prompts"))).filter((p) => p.active);

  if (!stocks.length || !prompts.length) {
    console.log("No stocks or prompts to process");
    return;
  }

  const runId = `run_${Date.now()}`;
  const runsStore = getStore("runs");
  const resultsStore = getStore("results");

  await runsStore.setJSON(runId, {
    id: runId, run_type: "scheduled",
    started_at: new Date().toISOString(),
    completed_at: null, status: "running", stocks_processed: 0,
  });

  let processed = 0;
  for (const stock of stocks) {
    try {
      const stockData = await fetchStockData(stock.symbol);
      for (const prompt of prompts) {
        try {
          const schemaStr = JSON.stringify(prompt.output_schema, null, 2);
          const { price_changes_30d, ...stockForAI } = stockData;
          const response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: `You are a professional stock analyst. Return ONLY valid JSON matching this schema:\n\n${schemaStr}\n\nReturn ONLY the JSON object, no markdown.`,
            messages: [{ role: "user", content: `Analyze this stock:\n\n${JSON.stringify(stockForAI, null, 2)}\n\n${prompt.prompt_text}` }],
          });
          let raw = response.content[0].text.trim();
          if (raw.includes("```")) { raw = raw.split("```")[1]; if (raw.startsWith("json")) raw = raw.slice(4); }
          const result = JSON.parse(raw.trim());
          const resultId = `${runId}_${stock.symbol}_${prompt.id}`;
          await resultsStore.setJSON(resultId, {
            id: resultId, run_id: runId, stock_symbol: stock.symbol,
            prompt_id: prompt.id, prompt_name: prompt.name,
            stock_data: stockData, structured_output: result,
            created_at: new Date().toISOString(),
          });
          console.log(`✓ ${stock.symbol} / ${prompt.name}`);
        } catch (e) {
          console.error(`✗ ${stock.symbol} / ${prompt.name}: ${e.message}`);
        }
      }
      processed++;
    } catch (e) {
      console.error(`✗ ${stock.symbol}: ${e.message}`);
    }
  }

  await runsStore.setJSON(runId, {
    id: runId, run_type: "scheduled",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "completed", stocks_processed: processed,
  });

  console.log(`Daily analysis complete. ${processed} stocks processed.`);
};

export const config = {
  schedule: "0 8 * * *",
};
