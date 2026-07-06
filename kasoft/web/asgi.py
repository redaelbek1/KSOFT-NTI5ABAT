from kasoft.api.main import create_api_app
from kasoft.web.app import app as flask_app
from starlette.middleware.wsgi import WSGIMiddleware

app = create_api_app()
app.mount("/", WSGIMiddleware(flask_app))
