import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from fews2board import config
from fews2board.api import utils
from collections import defaultdict


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


@router.get("/studio", response_class=HTMLResponse, include_in_schema=False)
async def render_chart_studio(
    request: fastapi.Request
): 
    
    topics = await utils.get_framework(request.app.async_pool)
    domains = {t["domain_id"]: t["domain"] for t in topics}
    date_ranges = await utils.date_ranges_overall(request.app.async_pool)
    date_ranges = date_ranges[0] if date_ranges else {}
    data = {
        "request": request, 
        "date_ranges": date_ranges,
        "topics": topics,
        "domains": domains,
        "countries": request.app.countries,
        "fews_countries": config.FEWS_COUNTRIES
        }
    return templates.TemplateResponse(
        "chart_studio.html", data
    )