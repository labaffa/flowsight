import fastapi
from fastapi.templating import Jinja2Templates

from sqlalchemy.ext.asyncio import AsyncSession
import datetime as dt
from sqlalchemy import text
from flowsight.db.models import TgSentimentDayDomainAgg, \
    TopicIdDayDomainAggTg, MCTopicIdDayDomainAgg, MCSentimentDayDomainAgg
from flowsight.db import models
from flowsight.db.utils import tablename, get_connection
from dateutil.parser import parse
from fastapi.responses import JSONResponse
import time
from sqlalchemy.orm import Session
from psycopg.rows import dict_row
from flowsight.api import utils
from flowsight.db.startup import check_database_readiness, ready_payload


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="flowsight/templates")


@router.get("/health")
async def health():
    return {"status": "ok", "app": "flowsight"}


@router.get("/ready")
async def ready(request: fastapi.Request):
    db_error = await check_database_readiness(
        getattr(request.app, "async_pool", None),
        getattr(request.app.state, "db_settings", None),
    )
    if db_error is not None:
        request.app.state.db_status = db_error.to_payload()
        return JSONResponse(
            status_code=503,
            content=request.app.state.db_status,
        )

    payload = ready_payload(request.app.state.db_settings)
    request.app.state.db_status = payload
    return payload


@router.get("/latest_updates")
async def get_latest_updates_dates_by_country(
    request: fastapi.Request
):
    response = await utils.latest_updates_by_country(request.app.async_pool)
    return response


@router.get("/countries")
async def get_countries(request: fastapi.Request):
    return [request.app.default_country]


@router.get("/{alpha_2}/date_ranges")
async def get_date_ranges_for_all_countries_and_streams(
    request: fastapi.Request, alpha_2: str
):
    if alpha_2.strip().lower() != request.app.default_country_alpha_2:
        raise fastapi.HTTPException(
            status_code=404, detail="Only Sudan is available in FlowSight."
        )
    country_id = request.app.default_country_id

    response = await utils.date_ranges_for_country(
        request.app.async_pool, country_id
    )
    return response
