import json

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from ai import AnthropicService
from db import get_db
from models import SuggestionRequest

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
        c.execute("SELECT name, description, prompt_text, output_schema FROM prompts WHERE active=1")
        prompts = []
        for row in c.fetchall():
            prompts.append({
                "name": row[0],
                "description": row[1],
                "prompt_text": row[2],
                "output_schema": json.loads(row[3]),
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
            recent_results.append({
                "prompt": row[0],
                "symbol": row[1],
                "output": json.loads(row[2]),
            })

    ai = AnthropicService()
    suggestions, usage = ai.generate_suggestions(prompts, recent_results, model=req.model)

    return jsonify({
        "suggestions": suggestions,
        "cost": usage.get("cost", 0),
    })
