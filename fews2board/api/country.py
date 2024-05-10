import fastapi
from fastapi.templating import Jinja2Templates
from fews2board.db.db_setup import get_async_db, get_db
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


@router.get("/domain_rank")
async def get_domain_rank_in_period_for_country(
    request: fastapi.Request,
    country_id: int,
    start_date: int, end_date: int
):
    response = await utils.domain_ranking_in_period(
        request.app.async_pool, country_id, start_date, end_date
    )
    return response