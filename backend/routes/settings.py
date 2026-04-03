import json
import os

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from config import DEFAULT_MODEL, SETTINGS_PATH
from models import SettingsPayload

bp = Blueprint("settings", __name__, url_prefix="/api")


def _load_settings() -> dict:
    if os.path.exists(SETTINGS_PATH):
        with open(SETTINGS_PATH) as f:
            return json.load(f)
    return {"model": DEFAULT_MODEL}


def _save_settings(data: dict):
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)


@bp.route("/settings", methods=["GET"])
def get_settings():
    return jsonify(_load_settings())


@bp.route("/settings", methods=["PUT"])
def update_settings():
    data = request.json or {}
    try:
        validated = SettingsPayload(**data)
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    settings = _load_settings()
    settings["model"] = validated.model
    _save_settings(settings)
    return jsonify(settings)
