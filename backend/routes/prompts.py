import json

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from db import get_db
from models import PromptCreate, PromptUpdate

bp = Blueprint("prompts", __name__, url_prefix="/api")


@bp.route("/prompts", methods=["GET"])
def get_prompts():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM prompts ORDER BY created_at")
        prompts = [dict(r) for r in c.fetchall()]
        for p in prompts:
            p["output_schema"] = json.loads(p["output_schema"])
    return jsonify(prompts)


@bp.route("/prompts", methods=["POST"])
def create_prompt():
    data = request.json or {}
    try:
        validated = PromptCreate(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    schema_str = json.dumps(validated.output_schema)
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO prompts (name, description, prompt_text, output_schema) VALUES (?, ?, ?, ?)",
            (validated.name, validated.description, validated.prompt_text, schema_str),
        )
        conn.commit()
        prompt_id = c.lastrowid
        c.execute("SELECT * FROM prompts WHERE id=?", (prompt_id,))
        result = dict(c.fetchone())
        result["output_schema"] = json.loads(result["output_schema"])
    return jsonify(result)


@bp.route("/prompts/<int:pid>", methods=["PUT"])
def update_prompt(pid):
    data = request.json or {}
    try:
        validated = PromptUpdate(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    schema_str = json.dumps(validated.output_schema)
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "UPDATE prompts SET name=?, description=?, prompt_text=?, output_schema=?, active=? WHERE id=?",
            (validated.name, validated.description, validated.prompt_text, schema_str, validated.active, pid),
        )
        conn.commit()
    return jsonify({"updated": pid})


@bp.route("/prompts/<int:pid>", methods=["DELETE"])
def delete_prompt(pid):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM prompts WHERE id=?", (pid,))
        conn.commit()
    return jsonify({"deleted": pid})
