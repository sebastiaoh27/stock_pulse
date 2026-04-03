from flask import Flask


def register_blueprints(app: Flask):
    from routes.health import bp as health_bp
    from routes.stocks import bp as stocks_bp
    from routes.prompts import bp as prompts_bp
    from routes.runs import bp as runs_bp
    from routes.statistics import bp as stats_bp
    from routes.settings import bp as settings_bp
    from routes.suggestions import bp as suggestions_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(stocks_bp)
    app.register_blueprint(prompts_bp)
    app.register_blueprint(runs_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(suggestions_bp)
