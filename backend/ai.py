"""Anthropic Claude service — singleton client, sync + batch modes, prompt caching."""

import atexit
import json
import logging
import os
import threading
import time

import anthropic
import httpx

from config import DEFAULT_MODEL, MODEL_PRICING, BATCH_DISCOUNT

logger = logging.getLogger(__name__)


class AnthropicService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def _ensure_init(self):
        if self._initialized:
            return
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")

        proxy_url = (
            os.environ.get("ANTHROPIC_PROXY")
            or os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("HTTP_PROXY")
            or os.environ.get("http_proxy")
        )

        timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=5.0)
        if proxy_url:
            logger.info(f"Using proxy for Anthropic: {proxy_url}")
            self._http_client = httpx.Client(proxy=proxy_url, timeout=timeout)
        else:
            self._http_client = httpx.Client(timeout=timeout)

        self._client = anthropic.Anthropic(api_key=api_key, http_client=self._http_client)
        self._initialized = True
        atexit.register(self.close)

    def close(self):
        if hasattr(self, "_http_client") and self._http_client:
            self._http_client.close()
            self._http_client = None
        self._initialized = False

    @property
    def client(self) -> anthropic.Anthropic:
        self._ensure_init()
        return self._client

    def run_analysis(
        self,
        stock_data: dict,
        prompt_text: str,
        output_schema: dict,
        model: str | None = None,
        technicals: dict | None = None,
    ) -> tuple[dict, str, dict]:
        """Run synchronous Claude analysis. Returns (structured_output, raw_text, usage)."""
        model = model or DEFAULT_MODEL
        schema_str = json.dumps(output_schema, indent=2)
        stock_str = json.dumps(
            {k: v for k, v in stock_data.items() if k != "price_changes_30d"},
            indent=2,
        )

        system_blocks = [
            {
                "type": "text",
                "text": (
                    "You are a professional stock analyst. Return ONLY valid JSON "
                    f"matching this schema:\n\n{schema_str}\n\n"
                    "Rules:\n"
                    "- Return ONLY the JSON object, no markdown, no explanation\n"
                    "- All required fields must be present\n"
                    "- Use exact field names and types from the schema\n"
                    "- Be precise and data-driven"
                ),
                "cache_control": {"type": "ephemeral"},
            }
        ]

        tech_context = ""
        if technicals:
            tech_context = f"\n\nPre-computed technical indicators:\n{json.dumps(technicals, indent=2)}"

        user_message = f"Analyze this stock and return structured JSON:\n\n{stock_str}\n\nAdditional context:\n{prompt_text}{tech_context}"

        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=1000,
                system=system_blocks,
                messages=[{"role": "user", "content": user_message}],
            )
        except anthropic.APIConnectionError as e:
            raise ConnectionError(
                f"Cannot reach Anthropic API. Check connection or set HTTPS_PROXY. Details: {e}"
            )
        except anthropic.AuthenticationError:
            raise ValueError("Anthropic API key is invalid. Check ANTHROPIC_API_KEY in .env")
        except anthropic.RateLimitError:
            raise ValueError("Anthropic rate limit hit — wait a minute and retry")

        if not response.content:
            raise ValueError("Anthropic returned an empty response")

        raw_text = response.content[0].text.strip()
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }

        # Calculate cost
        pricing = MODEL_PRICING.get(model, MODEL_PRICING[DEFAULT_MODEL])
        usage["cost"] = round(
            (usage["input_tokens"] * pricing["input"] + usage["output_tokens"] * pricing["output"])
            / 1_000_000,
            6,
        )

        # Parse JSON
        clean = raw_text
        if "```" in clean:
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        try:
            result = json.loads(clean.strip())
        except json.JSONDecodeError:
            raise ValueError(f"AI returned invalid JSON: {raw_text[:200]}")

        return result, raw_text, usage

    def submit_batch(self, requests: list[dict], model: str | None = None) -> str:
        """Submit a batch of analysis requests. Returns batch_id."""
        model = model or DEFAULT_MODEL
        batch = self.client.messages.batches.create(requests=requests)
        logger.info(f"Batch submitted: {batch.id} ({len(requests)} requests)")
        return batch.id

    def poll_batch(self, batch_id: str, poll_interval: int = 30, max_wait: int = 3600) -> str:
        """Poll batch until ended. Returns processing_status."""
        elapsed = 0
        while elapsed < max_wait:
            batch = self.client.messages.batches.retrieve(batch_id)
            if batch.processing_status == "ended":
                return "ended"
            logger.info(f"Batch {batch_id}: {batch.processing_status} ({elapsed}s elapsed)")
            time.sleep(poll_interval)
            elapsed += poll_interval
        return "timeout"

    def stream_batch_results(self, batch_id: str):
        """Yield individual results from a completed batch."""
        for result in self.client.messages.batches.results(batch_id):
            yield result

    def check_connectivity(self) -> dict:
        """Quick connectivity check."""
        try:
            self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=5,
                messages=[{"role": "user", "content": "hi"}],
            )
            proxy = os.environ.get("ANTHROPIC_PROXY") or os.environ.get("HTTPS_PROXY")
            return {"ok": True, "proxy": proxy or None}
        except anthropic.APIConnectionError as e:
            return {
                "ok": False,
                "error": f"Connection error: {e}",
                "hint": "Cannot reach api.anthropic.com. Check connection or set HTTPS_PROXY.",
            }
        except anthropic.AuthenticationError:
            return {
                "ok": False,
                "error": "Invalid API key",
                "hint": "Check ANTHROPIC_API_KEY in .env — it should start with sk-ant-",
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "hint": "Unexpected error"}

    def generate_suggestions(
        self,
        prompts: list[dict],
        recent_results: list[dict],
        model: str | None = None,
    ) -> tuple[list[dict], dict]:
        """Generate prompt improvement suggestions. Returns (suggestions_list, usage)."""
        model = model or DEFAULT_MODEL

        # Build a concise representation
        prompts_summary = []
        for p in prompts:
            schema = p.get("output_schema", {})
            fields = list(schema.get("properties", {}).keys()) if isinstance(schema, dict) else []
            prompts_summary.append({
                "name": p.get("name", ""),
                "description": p.get("description", ""),
                "fields": fields,
            })

        results_sample = []
        for r in recent_results[:10]:
            output = r.get("output", {})
            results_sample.append({
                "prompt": r.get("prompt", ""),
                "symbol": r.get("symbol", ""),
                "output_keys": list(output.keys()) if isinstance(output, dict) else [],
            })

        system = (
            "You are an expert prompt engineer specializing in financial AI systems. "
            "Generate actionable prompt improvements and new ideas for stock analysis. "
            "You MUST return a valid JSON object with a 'suggestions' array. "
            "No markdown, no explanation — ONLY the JSON object."
        )

        user_msg = (
            f"Current analysis prompts:\n{json.dumps(prompts_summary, indent=2)}\n\n"
            f"Recent result samples:\n{json.dumps(results_sample, indent=2)}\n\n"
            "Generate exactly 4 prompt suggestions (mix of improvements to existing prompts and brand new ideas).\n\n"
            "Return this exact JSON structure:\n"
            "{\n"
            '  "suggestions": [\n'
            "    {\n"
            '      "type": "improve",\n'
            '      "target_prompt": "Name of existing prompt to improve, or null for new",\n'
            '      "name": "Suggestion name",\n'
            '      "description": "What this prompt does",\n'
            '      "rationale": "Why this improves the system",\n'
            '      "prompt_text": "Full prompt text for Claude to analyze stocks",\n'
            '      "output_schema": {\n'
            '        "type": "object",\n'
            '        "properties": {\n'
            '          "field_name": {"type": "string", "enum": ["VAL1", "VAL2"]}\n'
            "        },\n"
            '        "required": ["field_name"]\n'
            "      },\n"
            '      "pros": ["strength 1", "strength 2", "strength 3"],\n'
            '      "cons": ["limitation 1", "limitation 2"]\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            "For 'type': use 'improve' when refining an existing prompt, 'new' for a brand new analysis angle.\n"
            "Ensure output_schema has both 'properties' and 'required' keys.\n"
            "Use enum arrays for categorical fields, 'number' for 0-100 scores, 'string' for text."
        )

        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=4000,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
            )
        except anthropic.APIConnectionError as e:
            raise ConnectionError(f"Cannot reach Anthropic API: {e}")
        except anthropic.AuthenticationError:
            raise ValueError("Anthropic API key is invalid")
        except anthropic.RateLimitError:
            raise ValueError("Anthropic rate limit hit — wait a minute and retry")

        if not response.content:
            return [], {"input_tokens": 0, "output_tokens": 0, "cost": 0}

        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }
        pricing = MODEL_PRICING.get(model, MODEL_PRICING[DEFAULT_MODEL])
        usage["cost"] = round(
            (usage["input_tokens"] * pricing["input"] + usage["output_tokens"] * pricing["output"])
            / 1_000_000,
            6,
        )

        raw = response.content[0].text.strip()
        logger.info(f"Suggestions raw response (first 500): {raw[:500]}")

        # Strip markdown fences if present
        clean = raw
        if "```" in clean:
            parts = clean.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    clean = part
                    break

        try:
            parsed = json.loads(clean.strip())
            # Handle both {"suggestions": [...]} and direct array
            if isinstance(parsed, list):
                suggestions = parsed
            elif isinstance(parsed, dict):
                suggestions = parsed.get("suggestions", [])
                if not suggestions:
                    # Try to find any list value
                    for v in parsed.values():
                        if isinstance(v, list):
                            suggestions = v
                            break
            else:
                suggestions = []
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse suggestions JSON: {e}\nRaw: {raw[:500]}")
            suggestions = []

        # Validate and sanitize each suggestion
        valid_suggestions = []
        for s in suggestions:
            if not isinstance(s, dict):
                continue
            # Ensure required fields
            if not s.get("name") or not s.get("prompt_text"):
                continue
            # Ensure output_schema is valid
            schema = s.get("output_schema", {})
            if not isinstance(schema, dict) or "properties" not in schema:
                # Build a minimal schema
                s["output_schema"] = {
                    "type": "object",
                    "properties": {
                        "signal": {"type": "string", "enum": ["BUY", "HOLD", "SELL", "WATCH"]},
                        "score": {"type": "number", "description": "Score 0-100"},
                        "summary": {"type": "string", "description": "Analysis summary"},
                    },
                    "required": ["signal", "score", "summary"],
                }
            if "required" not in s.get("output_schema", {}):
                s["output_schema"]["required"] = list(s["output_schema"].get("properties", {}).keys())
            # Ensure pros/cons are lists
            if not isinstance(s.get("pros"), list):
                s["pros"] = []
            if not isinstance(s.get("cons"), list):
                s["cons"] = []
            # Ensure type field
            if s.get("type") not in ("improve", "new"):
                s["type"] = "new"
            valid_suggestions.append(s)

        return valid_suggestions, usage
