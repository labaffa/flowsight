import csv
from collections import defaultdict
from pathlib import Path

import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from flowsight import config
from flowsight.api import utils
from psycopg.rows import dict_row


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="flowsight/templates")
REPO_ROOT = Path(__file__).resolve().parents[2]
MC_SUDAN_SOURCES_PATH = REPO_ROOT / "flowsight" / "db" / "datasets" / "mediacloud" / "sd.tsv"


def _studio_date_range(raw_date_ranges):
    rows = [row for row in raw_date_ranges if row["stream"] in {"mc", "tg", "si"}]
    if not rows:
        return {"min_date": None, "max_date": None}
    min_candidates = [row["min_date_id"] for row in rows if row["min_date_id"] is not None]
    max_candidates = [row["max_date_id"] for row in rows if row["max_date_id"] is not None]
    if not min_candidates or not max_candidates:
        return {"min_date": None, "max_date": None}
    min_date = min(min_candidates)
    max_date = max(max_candidates)
    return {"min_date": min_date, "max_date": max_date}


def _read_tsv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def _load_news_sources() -> list[dict]:
    rows = _read_tsv(MC_SUDAN_SOURCES_PATH)
    sources = []
    for row in rows:
        label = (row.get("label") or row.get("domain") or row.get("homepage") or "").strip()
        homepage = (row.get("homepage") or "").strip()
        if not label:
            continue
        sources.append(
            {
                "label": label,
                "homepage": homepage,
                "language": (row.get("primary_language") or "").strip() or "n/a",
                "media_type": (row.get("media_type") or "").strip() or "n/a",
                "country": (row.get("pub_country") or "").strip() or "n/a",
            }
        )
    sources.sort(key=lambda item: item["label"].lower())
    return sources


async def _load_telegram_sources_from_db(pool, country_id: int, alpha_2: str) -> tuple[list[dict], dict[str, int]]:
    schema = config.PG_SCHEMA_NAME or "public"
    alpha_2 = alpha_2.strip().lower()
    raw_message_table = f"{schema}.tg_message_{alpha_2}"
    hm_message_table = f"{schema}.tg_human_mobility_message_{alpha_2}"
    query = f"""
        WITH configured_resolved_channels AS (
            SELECT DISTINCT
                cfg.username AS configured_username,
                cfg.category AS configured_category,
                cfg.language AS configured_language,
                cfg.channel_type AS configured_channel_type,
                ch.channel_id,
                ch.title,
                ch.url,
                ch.username,
                ch.category AS resolved_category,
                ch.language AS resolved_language,
                ch.channel_type AS resolved_channel_type,
                ch.participants_count
            FROM {schema}.tg_channel_config cfg
            JOIN {schema}.tg_channel_username_alias alias
              ON lower(alias.username) = lower(cfg.username)
             AND alias.channel_id IS NOT NULL
             AND alias.resolution_status = 'resolved'
            JOIN {schema}.tg_channel ch
              ON ch.channel_id = alias.channel_id
            WHERE cfg.country_id = %s
        ),
        source_counts AS (
            SELECT
                crc.channel_id,
                count(DISTINCT tm.unique_id) AS total_messages,
                count(DISTINCT hm.message_unique_id) AS hm_messages
            FROM configured_resolved_channels crc
            LEFT JOIN {raw_message_table} tm
              ON tm.channel_id = crc.channel_id
             AND tm.country_id = %s
            LEFT JOIN {hm_message_table} hm
              ON hm.message_unique_id = tm.unique_id
             AND hm.country_id = tm.country_id
            GROUP BY crc.channel_id
        )
        SELECT
            crc.*,
            sc.total_messages,
            sc.hm_messages
        FROM configured_resolved_channels
        crc
        LEFT JOIN source_counts sc
          ON sc.channel_id = crc.channel_id
        ORDER BY
            coalesce(crc.configured_category, crc.resolved_category, 'Unclassified'),
            coalesce(crc.title, crc.username, crc.configured_username)
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(query, (country_id, country_id))
            rows = await cur.fetchall()

    sources = []
    category_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        category = (
            row.get("configured_category")
            or row.get("resolved_category")
            or "Unclassified"
        ).strip() or "Unclassified"
        language = (
            row.get("configured_language")
            or row.get("resolved_language")
            or "n/a"
        ).strip() or "n/a"
        source = {
            "title": (row.get("title") or row.get("username") or row.get("configured_username") or "").strip(),
            "username": (row.get("username") or row.get("configured_username") or "").strip(),
            "url": (row.get("url") or "").strip(),
            "category": category,
            "language": language,
            "type": (
                row.get("configured_channel_type")
                or row.get("resolved_channel_type")
                or "channel"
            ).strip() or "channel",
            "participants_count": row.get("participants_count"),
            "total_messages": row.get("total_messages"),
            "hm_messages": row.get("hm_messages"),
        }
        if not source["title"]:
            continue
        sources.append(source)
        category_counts[category] += 1

    return sources, dict(sorted(category_counts.items(), key=lambda item: item[0].lower()))


async def _load_taxonomy_from_db(pool) -> list[dict]:
    schema = config.PG_SCHEMA_NAME or "public"
    query = f"""
        SELECT
            p.id AS pillar_id,
            p.name AS pillar,
            d.id AS domain_id,
            d.name AS domain,
            i.id AS indicator_id,
            i.name AS indicator,
            t.id AS topic_id,
            t.topic AS component
        FROM {schema}.pillar p
        JOIN {schema}.domain d
            ON d.pillar_id = p.id
        LEFT JOIN {schema}.indicator i
            ON i.domain_id = d.id
        LEFT JOIN {schema}.topic t
            ON t.indicator_id = i.id
        ORDER BY
            p.id,
            d.id,
            i.id NULLS LAST,
            t.topic NULLS LAST
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(query)
            rows = await cur.fetchall()

    pillars: list[dict] = []
    pillar_lookup: dict[int, dict] = {}
    domain_lookup: dict[tuple[int, int], dict] = {}

    for row in rows:
        pillar_id = row["pillar_id"]
        domain_id = row["domain_id"]
        pillar = pillar_lookup.get(pillar_id)
        if pillar is None:
            pillar = {"id": pillar_id, "name": row["pillar"], "domains": []}
            pillar_lookup[pillar_id] = pillar
            pillars.append(pillar)

        domain_key = (pillar_id, domain_id)
        domain = domain_lookup.get(domain_key)
        if domain is None:
            domain = {
                "id": domain_id,
                "name": row["domain"],
                "indicators": [],
            }
            domain_lookup[domain_key] = domain
            pillar["domains"].append(domain)

        indicator_id = row["indicator_id"]
        if indicator_id is None:
            continue

        indicator = next((item for item in domain["indicators"] if item["id"] == indicator_id), None)
        if indicator is None:
            indicator = {
                "id": indicator_id,
                "name": row["indicator"],
                "components": [],
            }
            domain["indicators"].append(indicator)

        component = row["component"]
        if component and component not in indicator["components"]:
            indicator["components"].append(component)

    return pillars


def _about_base_context(request: fastapi.Request) -> dict:
    return {
        "request": request,
        "countries": {request.app.default_country_alpha_2: request.app.default_country},
        "fews_countries": [request.app.default_country_alpha_2],
        "branding": config.BRANDING,
        "version": config.VERSION,
    }


@router.get("/studio", response_class=HTMLResponse, include_in_schema=False)
async def render_chart_studio(request: fastapi.Request):
    topics = await utils.get_framework(request.app.async_pool)
    domains = {t["domain_id"]: t["domain"] for t in topics}
    raw_date_ranges = await utils.date_ranges_for_country(
        request.app.async_pool, request.app.default_country_id
    )
    data = {
        "request": request,
        "date_ranges": _studio_date_range(raw_date_ranges),
        "topics": topics,
        "domains": domains,
        "countries": {request.app.default_country_alpha_2: request.app.default_country},
        "fews_countries": [request.app.default_country_alpha_2],
        "default_country": request.app.default_country,
        "branding": config.BRANDING,
        "version": config.VERSION,
        "page_title": f'{config.BRANDING["name"]} | {config.BRANDING["studio_label"]}',
    }
    return templates.TemplateResponse("chart_studio.html", data)


@router.get("/about", response_class=HTMLResponse)
async def read_about(request: fastapi.Request):
    return templates.TemplateResponse(
        "about.html",
        {
            **_about_base_context(request),
            "page_title": f'{config.BRANDING["name"]} | About',
        },
    )


@router.get("/about/news-sources", response_class=HTMLResponse)
async def read_about_news_sources(request: fastapi.Request):
    return templates.TemplateResponse(
        "about_news_sources.html",
        {
            **_about_base_context(request),
            "page_title": f'{config.BRANDING["name"]} | News Sources',
            "news_sources": _load_news_sources(),
        },
    )


@router.get("/about/telegram-sources", response_class=HTMLResponse)
async def read_about_telegram_sources(request: fastapi.Request):
    telegram_sources, telegram_category_counts = await _load_telegram_sources_from_db(
        request.app.async_pool,
        request.app.default_country_id,
        request.app.default_country_alpha_2,
    )
    return templates.TemplateResponse(
        "about_telegram_sources.html",
        {
            **_about_base_context(request),
            "page_title": f'{config.BRANDING["name"]} | Telegram Sources',
            "telegram_sources": telegram_sources,
            "telegram_category_counts": telegram_category_counts,
        },
    )


@router.get("/about/taxonomy", response_class=HTMLResponse)
async def read_about_taxonomy(request: fastapi.Request):
    return templates.TemplateResponse(
        "about_taxonomy.html",
        {
            **_about_base_context(request),
            "page_title": f'{config.BRANDING["name"]} | Taxonomy',
            "taxonomy": await _load_taxonomy_from_db(request.app.async_pool),
        },
    )
