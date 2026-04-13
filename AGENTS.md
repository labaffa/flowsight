# AGENTS

This file defines the default working rules for agents operating in the `FlowSight` repository.

## Project Identity

- This repository is `FlowSight`.
- The product scope is currently Sudan-only.
- The app surface is intentionally limited to:
  - `/` for the Sudan dashboard
  - `/studio` for the Sudan-only chart studio

## Mandatory Environment Rules

- Always use `uv` for Python environment and command execution.
- Always use the repo-local virtual environment at `.venv/`.
- If `.venv/` does not exist, create it before running Python tooling:

```bash
uv venv .venv
```

- Install dependencies with `uv`, not with bare `pip`:

```bash
uv pip install -r requirements.txt
```

- Run Python commands through `uv run` whenever possible:

```bash
uv run uvicorn flowsight.app:app --reload
```

## Disallowed Defaults

- Do not use global Python packages.
- Do not use bare `pip install ...`.
- Do not switch to Poetry, pipenv, conda, or another env manager unless explicitly requested.
- Do not assume the upstream multi-country behavior still applies here.

## Repo-Specific Guardrails

- Preserve the Sudan-only routing and UI constraints unless the task explicitly expands scope.
- Prefer editing branding in `flowsight/config/__init__.py` before scattering literals through templates or JS.
- Prefer editing shared layout in `flowsight/templates/base/` and visual overrides in `flowsight/static/css/flowsight.css`.
- Be careful not to confuse this repo with the upstream source repository in `git_repos/`.

## First Checks Before Work

Run these checks at the start of a task:

```bash
pwd
uv --version
test -d .venv || uv venv .venv
```

## Recommended Validation

For lightweight validation after edits:

```bash
uv run python -m compileall flowsight
```
