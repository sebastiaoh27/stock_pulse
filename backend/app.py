"""StockPulse — App factory."""

import logging
import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from config import FRONTEND_BUILD
from db import init_db
from routes import register_blueprints
from scheduler import init_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(__name__, static_folder=FRONTEND_BUILD, static_url_path="")
    CORS(app)

    init_db()
    register_blueprints(app)
    init_scheduler()

    # Serve React — must be registered AFTER blueprints
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        if path and os.path.exists(os.path.join(FRONTEND_BUILD, path)):
            return send_from_directory(FRONTEND_BUILD, path)
        return send_from_directory(FRONTEND_BUILD, "index.html")

    return app


if __name__ == "__main__":
    app = create_app()
    logger.info("StockPulse backend starting on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
