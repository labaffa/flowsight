import fastapi
from fastapi.templating import Jinja2Templates

from sqlalchemy.ext.asyncio import AsyncSession
import datetime as dt
from sqlalchemy import text
from fews2board.db.models import TgSentimentDayDomainAgg, \
    TopicIdDayDomainAggTg, MCTopicIdDayDomainAgg, MCSentimentDayDomainAgg
from fews2board.db import models
from fews2board.db.utils import tablename, get_connection
from dateutil.parser import parse
from fastapi.responses import JSONResponse
import time
from sqlalchemy.orm import Session
from psycopg.rows import dict_row
from fews2board.api import utils


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


@router.get("/latest_updates")
async def get_latest_updates_dates_by_country(
    request: fastapi.Request
):
    response = await utils.latest_updates_by_country(request.app.async_pool)
    return response


@router.get("/countries")
async def get_countries(request: fastapi.Request):
    response = await utils.get_country_codes(request.app.async_pool)
    return response


@router.get("/{alpha2}/date_ranges")
async def get_date_ranges_for_all_countries_and_streams(
    request: fastapi.Request, alpha_2: str
):
    try:
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
    )

    response = await utils.date_ranges_for_country(
        request.app.async_pool, country_id
    )
    return response