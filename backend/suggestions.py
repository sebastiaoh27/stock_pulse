import json
import logging

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from ai import AnthropicService
from db import get_db
from models import SuggestionRequest

logger = logging.getLogger(__name__)
bp = Blueprint("suggestions", __name__, url_prefix="/api")


@bp.route("/suggestions", methods=["POST"])
def generate():
    data = request.json or {}
    try:
        req = SuggestionRequest(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    # Load current prompts
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, description, prompt_text, output_schema FROM prompts WHERE active=1")
        prompts = []
        for row in c.fetchall():
            try:
                schema = json.loads(row[3]) if isinstance(row[3], str) else row[3]
            except (json.JSONDecodeError, TypeError):
                schema = {}
            prompts.append({
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "prompt_text": row[3],
                "output_schema": schema,
            })

        # Load recent results
        c.execute("""
            SELECT rr.prompt_name, rr.stock_symbol, rr.structured_output
            FROM run_results rr
            JOIN runs r ON r.id = rr.run_id
            WHERE r.status = 'completed'
            ORDER BY rr.created_at DESC
            LIMIT 20
        """)
        recent_results = []
        for row in c.fetchall():
            try:
                output = json.loads(row[2]) if isinstance(row[2], str) else row[2]
            except (json.JSONDecodeError, TypeError):
                output = {}
            recent_results.append({
                "prompt": row[0],
                "symbol": row[1],
                "output": output,
            })

    try:
        ai = AnthropicService()
        suggestions, usage = ai.generate_suggestions(prompts, recent_results, model=req.model)
        return jsonify({
            "suggestions": suggestions,
            "cost": usage.get("cost", 0),
        })
    except Exception as e:
        logger.error(f"Suggestions generation failed: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/suggestions/adopt", methods=["POST"])
def adopt():
    """Adopt a suggestion: create new prompt or update existing one."""
    data = request.json or {}
    suggestion = data.get("suggestion", {})
    target_prompt_id = data.get("target_prompt_id")  # if updating existing
    action = data.get("action", "create")  # "create" or "update"

    if not suggestion:
        return jsonify({"error": "suggestion required"}), 400

    name = suggestion.get("name", "").strip()
    prompt_text = suggestion.get("prompt_text", "").strip()
    output_schema = suggestion.get("output_schema", {})
    description = suggestion.get("description", "").strip()

    if not name or not prompt_text:
        return jsonify({"error": "name and prompt_text required"}), 400

    if not isinstance(output_schema, dict) or "properties" not in output_schema:
        return jsonify({"error": "output_schema must have a 'properties' key"}), 400

    schema_str = json.dumps(output_schema)

    with get_db() as conn:
        c = conn.cursor()

        if action == "update" and target_prompt_id:
            # Update existing prompt
            c.execute(
                "UPDATE prompts SET name=?, description=?, prompt_text=?, output_schema=? WHERE id=?",
                (name, description, prompt_text, schema_str, target_prompt_id),
            )
            conn.commit()
            c.execute("SELECT * FROM prompts WHERE id=?", (target_prompt_id,))
            row = c.fetchone()
            if not row:
                return jsonify({"error": "Prompt not found"}), 404
            result = dict(row)
            result["output_schema"] = json.loads(result["output_schema"])
            return jsonify({"action": "updated", "prompt": result})
        else:
            # Create new prompt
            c.execute(
                "INSERT INTO prompts (name, description, prompt_text, output_schema) VALUES (?, ?, ?, ?)",
                (name, description, prompt_text, schema_str),
            )
            conn.commit()
            prompt_id = c.lastrowid
            c.execute("SELECT * FROM prompts WHERE id=?", (prompt_id,))
            result = dict(c.fetchone())
            result["output_schema"] = json.loads(result["output_schema"])
            return jsonify({"action": "created", "prompt": result})
