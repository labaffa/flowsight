from __future__ import annotations

import asyncio
from dataclasses import dataclass

import psycopg
from psycopg import errors as pg_errors
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool, PoolTimeout

from flowsight import config
from flowsight.db import models

CONNECT_TIMEOUT_SECONDS = 5
POOL_WAIT_TIMEOUT_SECONDS = 10.0
REQUIRED_BOOTSTRAP_TABLES = (
    models.Country.__table__.name,
    models.Domain.__table__.name,
)


@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    database: str
    user: str
    password: str
    schema: str

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"


class DatabaseStartupError(RuntimeError):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind

    def to_payload(self) -> dict:
        return {
            "status": "not_ready",
            "database": {
                "ready": False,
                "kind": self.kind,
                "message": str(self),
            },
        }


def load_database_settings() -> DatabaseSettings:
    raw_host = _clean(config.PG_HOST)
    raw_port = _clean(config.PG_PORT)
    database = _clean(config.PG_DATABASE)
    user = _clean(config.PG_USER)
    password = _clean(config.PG_PASSWORD)
    schema = _clean(config.PG_SCHEMA_NAME)

    missing = [
        name
        for name, value in (
            ("PG_HOST", raw_host),
            ("PG_DATABASE", database),
            ("PG_USER", user),
            ("PG_PASSWORD", password),
            ("PG_SCHEMA_NAME", schema),
        )
        if not value
    ]
    if raw_host and ":" not in raw_host and not raw_port:
        missing.append("PG_PORT")
    if missing:
        missing_str = ", ".join(sorted(set(missing)))
        raise DatabaseStartupError(
            "missing_env",
            (
                "Database startup failed: missing required environment variables: "
                f"{missing_str}. Set PG_HOST as host:port or provide PG_PORT separately."
            ),
        )

    host = raw_host
    port_str = raw_port
    if ":" in raw_host:
        host, port_str = raw_host.rsplit(":", 1)
    host = host.strip()
    if not host:
        raise DatabaseStartupError(
            "missing_env",
            "Database startup failed: PG_HOST must contain a hostname.",
        )
    try:
        port = int(port_str)
    except (TypeError, ValueError) as exc:
        raise DatabaseStartupError(
            "missing_env",
            "Database startup failed: PG_PORT must be a valid integer.",
        ) from exc

    return DatabaseSettings(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
        schema=schema,
    )


def get_conninfo(settings: DatabaseSettings) -> str:
    return make_conninfo(
        dbname=settings.database,
        user=settings.user,
        password=settings.password,
        host=settings.host,
        port=settings.port,
        connect_timeout=CONNECT_TIMEOUT_SECONDS,
    )


async def open_verified_pool(
    settings: DatabaseSettings, *, min_size: int = 1, max_size: int = 20
) -> AsyncConnectionPool:
    conninfo = get_conninfo(settings)
    await probe_tcp_connectivity(settings)
    await asyncio.wait_for(
        probe_database_connection(conninfo, settings),
        timeout=POOL_WAIT_TIMEOUT_SECONDS,
    )

    pool = AsyncConnectionPool(
        conninfo=conninfo,
        open=False,
        min_size=min_size,
        max_size=max_size,
        timeout=POOL_WAIT_TIMEOUT_SECONDS,
        reconnect_timeout=POOL_WAIT_TIMEOUT_SECONDS,
    )
    try:
        await asyncio.wait_for(pool.open(), timeout=POOL_WAIT_TIMEOUT_SECONDS)
    except Exception:
        await close_pool(pool)
        raise
    return pool


async def probe_database_connection(conninfo: str, settings: DatabaseSettings) -> None:
    async with await psycopg.AsyncConnection.connect(conninfo) as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            refs = await _fetch_database_refs(cur, settings)

    _validate_database_refs(refs, settings)


async def probe_database(
    pool: AsyncConnectionPool, settings: DatabaseSettings
) -> None:
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            refs = await _fetch_database_refs(cur, settings)

    _validate_database_refs(refs, settings)


async def check_database_readiness(
    pool: AsyncConnectionPool | None, settings: DatabaseSettings | None
) -> DatabaseStartupError | None:
    if pool is None or settings is None:
        return DatabaseStartupError(
            "startup_incomplete",
            "Database readiness check failed: database pool is not initialized.",
        )
    try:
        await asyncio.wait_for(
            probe_database(pool, settings),
            timeout=POOL_WAIT_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        return classify_database_error(exc, settings)
    return None


def classify_database_error(
    exc: Exception, settings: DatabaseSettings | None
) -> DatabaseStartupError:
    if isinstance(exc, DatabaseStartupError):
        return exc

    database = settings.database if settings else "<unknown>"
    schema = settings.schema if settings else "<unknown>"
    user = settings.user if settings else "<unknown>"
    address = settings.address if settings else "<unknown>"

    if isinstance(
        exc,
        (
            pg_errors.InvalidPassword,
            pg_errors.InvalidAuthorizationSpecification,
        ),
    ):
        return DatabaseStartupError(
            "invalid_credentials",
            (
                "Database startup failed: authentication was rejected for "
                f"user '{user}' on database '{database}'. Check PG_USER and "
                "PG_PASSWORD."
            ),
        )
    if isinstance(exc, pg_errors.InvalidCatalogName):
        return DatabaseStartupError(
            "invalid_database",
            (
                "Database startup failed: database "
                f"'{database}' does not exist or is not accessible."
            ),
        )
    if isinstance(
        exc,
        (
            pg_errors.InvalidSchemaName,
            pg_errors.UndefinedTable,
            pg_errors.UndefinedObject,
        ),
    ):
        return DatabaseStartupError(
            "invalid_schema",
            (
                "Database startup failed: schema "
                f"'{schema}' is invalid or does not expose the tables FlowSight "
                "expects."
            ),
        )
    if isinstance(exc, pg_errors.InsufficientPrivilege):
        return DatabaseStartupError(
            "invalid_schema",
            (
                "Database startup failed: user "
                f"'{user}' does not have sufficient privileges on schema "
                f"'{schema}'."
            ),
        )
    if isinstance(exc, (asyncio.TimeoutError, PoolTimeout, psycopg.OperationalError)):
        return DatabaseStartupError(
            "unreachable_host",
            (
                "Database startup failed: PostgreSQL is unreachable at "
                f"{address}. Check PG_HOST, PG_PORT, and network access."
            ),
        )
    if isinstance(exc, psycopg.Error):
        return DatabaseStartupError(
            "database_error",
            (
                "Database startup failed while validating database "
                f"'{database}' and schema '{schema}'."
            ),
        )
    return DatabaseStartupError(
        "database_error",
        "Database startup failed due to an unexpected database initialization error.",
    )


def ready_payload(settings: DatabaseSettings) -> dict:
    return {
        "status": "ready",
        "database": {
            "ready": True,
            "host": settings.host,
            "port": settings.port,
            "database": settings.database,
            "schema": settings.schema,
            "required_relations": list(REQUIRED_BOOTSTRAP_TABLES),
        },
    }


async def close_pool(pool: AsyncConnectionPool | None) -> None:
    if pool is None:
        return
    try:
        await pool.close()
    except Exception:
        pass


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


async def probe_tcp_connectivity(settings: DatabaseSettings) -> None:
    writer = None
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(settings.host, settings.port),
            timeout=CONNECT_TIMEOUT_SECONDS,
        )
    except (asyncio.TimeoutError, OSError) as exc:
        raise DatabaseStartupError(
            "unreachable_host",
            (
                "Database startup failed: PostgreSQL is unreachable at "
                f"{settings.address}. Check PG_HOST, PG_PORT, and network access."
            ),
        ) from exc
    finally:
        if writer is not None:
            writer.close()
            await writer.wait_closed()


async def _fetch_database_refs(cur, settings: DatabaseSettings) -> dict:
    await cur.execute(
        """
        select
            to_regnamespace(%s) as schema_ref,
            to_regclass(%s) as country_ref,
            to_regclass(%s) as domain_ref
        """,
        (
            settings.schema,
            f"{settings.schema}.{models.Country.__table__.name}",
            f"{settings.schema}.{models.Domain.__table__.name}",
        ),
    )
    return await cur.fetchone()


def _validate_database_refs(refs: dict, settings: DatabaseSettings) -> None:
    if refs["schema_ref"] is None:
        raise DatabaseStartupError(
            "invalid_schema",
            (
                "Database startup failed: schema "
                f"'{settings.schema}' was not found in database '{settings.database}'."
            ),
        )

    missing_relations = [
        table_name
        for table_name, ref_name in (
            (models.Country.__table__.name, refs["country_ref"]),
            (models.Domain.__table__.name, refs["domain_ref"]),
        )
        if ref_name is None
    ]
    if missing_relations:
        missing_relations_str = ", ".join(missing_relations)
        raise DatabaseStartupError(
            "invalid_schema",
            (
                "Database startup failed: schema "
                f"'{settings.schema}' is missing required relations: "
                f"{missing_relations_str}."
            ),
        )
