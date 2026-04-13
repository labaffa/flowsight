# Development

## Overview

FlowSight is a Sudan-only fork of the original dashboard. The current implementation keeps the FastAPI + Jinja2 stack and a reduced product surface.

Key behaviors:

- `/` is the Sudan dashboard
- `/studio` is the Sudan-only chart studio
- the original landing page is not part of this fork

## Local Setup

This repository uses `uv` and the repo-local `.venv/`.

Create the virtual environment if needed:

```bash
uv venv .venv
```

Install dependencies:

```bash
uv pip install -r requirements.txt
```

Run the app:

```bash
uv run uvicorn flowsight.app:app --reload
```

The app fails fast during startup if the PostgreSQL configuration is incomplete or invalid. Use `/health` for liveness and `/ready` for DB readiness once the server is up.

## Useful Commands

Compile Python modules:

```bash
uv run python -m compileall flowsight
```

Show git status:

```bash
git status --short
```

## Where To Edit Things

- Branding defaults: `flowsight/config/__init__.py`
- Shared page shell: `flowsight/templates/base/`
- FlowSight visual overrides: `flowsight/static/css/flowsight.css`
- Sudan-only UI routing: `flowsight/ui/`
- Sudan-only API constraints: `flowsight/api/`

## Current Constraints

- Keep the app Sudan-only unless a task explicitly expands country scope.
- Keep local Python work inside `.venv/`.
- Use `uv` as the default interface for environment and execution tasks.
- The package/module path is `flowsight` and should stay aligned with the product name.
