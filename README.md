# FlowSight

FlowSight helps users explore human mobility in Sudan using Telegram messages,
news stories and Google Trends data, including the Synthetic Search Interest Index (SSI).
Its dashboard brings together trends, topic classifications and sentiment to
support exploration of the available data.

## Features

- Explore human mobility trends across Telegram messages and news stories.
- Examine topic and sentiment patterns in social and news coverage.
- Explore Google Trends search interest using the Synthetic Search Interest Index.
- Use the experimental Topic Explorer to explore machine-discovered themes,
  their evolution and supporting messages or stories.
- Filter dashboard views by topic and time period.

FlowSight uses FastAPI and PostgreSQL. It needs a database with the compatible
FlowSight schema and data. The database can be populated by running the
[FlowSight ETL](https://github.com/labaffa/fews2etl) or by restoring a snapshot
of an existing populated database. This repository does not include a complete
database. A snapshot provides a fixed view without running the update pipeline.

## Docker Compose

Docker Compose can run the app and a PostgreSQL 14 database together. A fresh
database is empty: populate it using the ETL or restore a compatible snapshot
before starting the app. Follow the ETL repository's instructions for its data
sources, credentials and database setup.

Copy `.env.compose.example` to `.env.compose` and set the database name, user,
and a strong password. Keep this file private. From the repository root:

```bash
cp .env.compose.example .env.compose
# Edit .env.compose before starting the database.
docker compose --env-file .env.compose up -d db
```

The database is not published to a host port by this configuration. To run the
ETL against it, connect the ETL container to the Compose network and use `db`
as its database host, or configure access to the database explicitly.

Once PostgreSQL is ready, populate it with the ETL or restore a snapshot. For
example, to restore a PostgreSQL custom-format backup into the empty database,
replace the database name and user below with the values in `.env.compose`:

```bash
docker compose --env-file .env.compose exec -T db \
  pg_restore -U flowsight -d flowsight --no-owner --no-acl --exit-on-error \
  < /path/to/backup.dump
```

After the database is populated, start the app:

```bash
docker compose --env-file .env.compose up -d --build app
```

Open `http://localhost:8000`. PostgreSQL data persists in a Docker volume.
Restore only into an empty database; a failed restore can leave partial data.
The app port is bound to localhost by default. Configure an HTTPS reverse proxy
for public access; deployment under a URL subpath has not been validated.

## Configuration

Configure the database connection using these environment variables:

| Variable | Description |
| --- | --- |
| `PG_HOST` | PostgreSQL host name or IP address; it can include a port. |
| `PG_PORT` | PostgreSQL port, required if not included in `PG_HOST`. |
| `PG_DATABASE` | Name of the PostgreSQL database. |
| `PG_SCHEMA_NAME` | Schema containing the FlowSight tables. |
| `PG_USER` | Database user with access to the schema and its tables. |
| `PG_PASSWORD` | Password for that database user. |

See `.env.example` for a configuration template. Supply credentials securely
and do not commit them. In the Compose setup, `PG_HOST` and `PG_PORT` are set
for the app automatically; the remaining values come from `.env.compose`.

## Local development

Use `uv` and the repository-local environment:

```bash
uv venv .venv
uv pip install -r requirements.txt
uv run uvicorn flowsight.app:app --reload
```

Configure the database variables above in the environment before starting.
Highcharts assets are provided locally.

## Verify the deployment

Open the dashboard and check that its charts and topic explorer load with the
expected data. `/health` checks process liveness; `/ready` checks database
readiness.

For development, shared page templates are in `flowsight/templates/base/`,
styling in `flowsight/static/css/flowsight.css`, UI routes in `flowsight/ui/`,
and API routes in `flowsight/api/`. Agent instructions are in `AGENTS.md`.
