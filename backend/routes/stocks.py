from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from db import get_db
from models import StockSymbol
from yahoo import fetch_stock_data, search_stocks

bp = Blueprint("stocks", __name__, url_prefix="/api")


@bp.route("/stocks", methods=["GET"])
def get_stocks():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM stocks ORDER BY symbol")
        return jsonify([dict(r) for r in c.fetchall()])


@bp.route("/stocks", methods=["POST"])
def add_stock():
    data = request.json or {}
    try:
        validated = StockSymbol(symbol=data.get("symbol", ""))
    except ValidationError as e:
        return jsonify({"error": e.errors()[0]["msg"]}), 400

    try:
        stock_data = fetch_stock_data(validated.symbol)
        with get_db() as conn:
            c = conn.cursor()
            c.execute(
                "INSERT OR IGNORE INTO stocks (symbol, name) VALUES (?, ?)",
                (validated.symbol, stock_data.get("name", validated.symbol)),
            )
            conn.commit()
        return jsonify({
            "symbol": validated.symbol,
            "name": stock_data.get("name", validated.symbol),
            "data": stock_data,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/stocks/<symbol>", methods=["DELETE"])
def delete_stock(symbol):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM stocks WHERE symbol = ?", (symbol.upper(),))
        conn.commit()
    return jsonify({"deleted": symbol})


@bp.route("/stocks/<symbol>/data", methods=["GET"])
def get_stock_data(symbol):
    try:
        data = fetch_stock_data(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/stocks/search", methods=["GET"])
def stock_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])
    return jsonify(search_stocks(query))
