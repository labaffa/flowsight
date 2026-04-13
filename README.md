# FlowSight

FlowSight is a Sudan-only fork of the original dashboard, focused on the country-specific experience and a Sudan-only chart studio.

## What It Exposes

- `/` renders the Sudan dashboard
- `/studio` renders the Sudan-only chart studio
- the original landing page is intentionally not part of this fork

## Environment Variables

The app needs these mandatory environment variables:
* **PG_HOST**: postgres host, or `host:port`
* **PG_PORT**: postgres port if not embedded in `PG_HOST`
* **PG_DATABASE**: the name of the database
* **PG_SCHEMA_NAME**: the name of the postgres schema inside the **PG_DATABASE**
* **PG_USER** and **PG_PASSWORD**: user's credentials

Optional app theming:
* **FLOWSIGHT_COLOR_SCHEME**: select one of `atlas`, `nile`, `clay`

Startup now fails fast with explicit database diagnostics. FlowSight distinguishes:
- missing or invalid DB env configuration
- unreachable postgres host or port
- rejected credentials
- invalid database name
- invalid schema or missing required bootstrap tables (`country`, `domain`)

Two lightweight operational endpoints are available:
- `/health` for process liveness
- `/ready` for live database readiness

Highcharts assets for `/` and `/studio` are vendored under `flowsight/static/vendor/highcharts/` so the app does not depend on the public Highcharts CDN at runtime.

## Local Development

This repo should be worked on with `uv` and the repo-local virtual environment in `.venv/`.

Create the virtual environment if it is missing:

```bash
uv venv .venv
```

Install dependencies into `.venv`:

```bash
uv pip install -r requirements.txt
```

Run the app locally:

```bash
uv run uvicorn flowsight.app:app --reload
```

Launch with a specific color scheme:

```bash
FLOWSIGHT_COLOR_SCHEME=nile uv run uvicorn flowsight.app:app --reload
```

## Project Notes

- Branding defaults live in `flowsight/config/__init__.py`
- Shared page chrome lives in `flowsight/templates/base/`
- FlowSight-specific visual overrides live in `flowsight/static/css/flowsight.css`
- The app is intentionally constrained to Sudan unless a task explicitly changes product scope

## Agent and Developer Docs

- `AGENTS.md` contains mandatory rules for agents working in this repo
- `DEVELOPMENT.md` contains the local workflow, structure notes, and common commands

### Docker

Open a terminal in the root directory of the repository and build the Docker image:

```bash
docker build -t <image-name> .
```

If you place env variables on an `.env` file, start the application using the following command:

```bash
docker run --env-file .env -p 8000:8000 -it <image-name>
```
