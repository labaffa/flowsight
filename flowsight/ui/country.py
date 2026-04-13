import fastapi
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from flowsight import config
from flowsight.api import utils
from asyncio import gather


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="flowsight/templates")


def _country_context(request: fastapi.Request) -> dict:
    country = request.app.default_country
    country_id = int(country["country_id"])
    return {
        "alpha_2": request.app.default_country_alpha_2,
        "country_id": country_id,
        "country_name": country["name"],
    }


async def _render_default_country(request: fastapi.Request) -> HTMLResponse:
    country_ctx = _country_context(request)
    sql_coros = [
        utils.get_framework(request.app.async_pool),
        utils.date_ranges_for_country(request.app.async_pool, country_ctx["country_id"]),
    ]
    topics, raw_date_ranges = await gather(*sql_coros)
    date_ranges = {
        dr["stream"]: [dr["min_date_id"], dr["max_date_id"]]
        for dr in raw_date_ranges
    }
    domains = {t["domain_id"]: t["domain"] for t in topics}
    data = {
        "request": request,
        "country": country_ctx["alpha_2"],
        "country_name": country_ctx["country_name"],
        "date_ranges": date_ranges,
        "topics": topics,
        "domains": domains,
        "countries": {country_ctx["alpha_2"]: request.app.default_country},
        "fews_countries": [country_ctx["alpha_2"]],
        "branding": config.BRANDING,
        "version": config.VERSION,
        "page_title": f'{config.BRANDING["name"]} | {country_ctx["country_name"]}',
    }
    return templates.TemplateResponse("country.html", data)


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def read_home(request: fastapi.Request):
    return await _render_default_country(request)


@router.get("/country/{alpha_2}", response_class=HTMLResponse, include_in_schema=False)
async def read_country(request: fastapi.Request, alpha_2: str):
    if alpha_2.strip().lower() != request.app.default_country_alpha_2:
        raise fastapi.HTTPException(status_code=404, detail="Only Sudan is available in FlowSight.")
    return RedirectResponse(url="/", status_code=307)
