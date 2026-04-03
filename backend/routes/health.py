import os
from datetime import datetime

from flask import Blueprint, jsonify

from ai import AnthropicService

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.route("/health", methods=["GET"])
def health():
    proxy = (
        os.environ.get("ANTHROPIC_PROXY")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("https_proxy")
    )
    return jsonify({
        "status": "ok",
        "time": datetime.now().isoformat(),
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "proxy": proxy or None,
    })


@bp.route("/health/anthropic", methods=["GET"])
def health_anthropic():
    result = AnthropicService().check_connectivity()
    status_code = 200 if result["ok"] else 503
    return jsonify(result), status_code
