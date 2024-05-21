import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from fews2board import config
from fews2board.api import utils
from collections import defaultdict
import copy


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


@router.get("/country/{alpha_2}", response_class=HTMLResponse, include_in_schema=False)
async def read_landing(
    request: fastapi.Request, alpha_2: str
): 
    nested_dicts = lambda: defaultdict(nested_dicts)
    topics = await utils.get_framework(request.app.async_pool)
    domains = {t["domain_id"]: t["domain"] for t in topics}
    try:
        alpha_2 = alpha_2.strip().lower()
        country_name = request.app.countries[alpha_2]["name"]
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
        date_ranges = await utils.date_ranges_for_country(
            request.app.async_pool, country_id
        )
        latest_updates = {
            l["data_stream"]: l["date_id"] 
            for l in await utils.latest_updates_by_country(request.app.async_pool)
            if l["country_id"] == request.app.countries[alpha_2]["country_id"]
        }
        date_ranges = {
            dr["stream"]: [dr["min_date_id"], dr["max_date_id"]]
            for dr in date_ranges
        }
    except Exception:
        raise fastapi.HTTPException(
            status_code=404, detail=f'Country {alpha_2} not found'
        )
    data = {
        "request": request, 
        "country": alpha_2, 
        "country_name": country_name,
        "latest_updates": latest_updates,
        "date_ranges": date_ranges,
        "topics": topics, 
        "domains": domains
        }
    return templates.TemplateResponse(
        "country.html", data
    )