import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from flowsight import config
from flowsight.api import utils


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="flowsight/templates")


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
            "request": request,
            "countries": {request.app.default_country_alpha_2: request.app.default_country},
            "fews_countries": [request.app.default_country_alpha_2],
            "branding": config.BRANDING,
            "version": config.VERSION,
            "page_title": f'{config.BRANDING["name"]} | User Guide',
        },
    )
