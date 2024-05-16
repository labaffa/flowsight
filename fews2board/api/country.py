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
from collections import defaultdict


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


@router.get("/{alpha_2}/domain_ranking")
async def get_domain_rank_in_period_for_country(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int, 
    end_date: int,
    stream: str
):
    try:
        country_id = int(request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    if stream not in ["tg", "mc"]:
        raise fastapi.HTTPException(
            status_code=400, detail=f'Stream {stream} not allowed.'
        )
    response = await utils.domain_ranking_in_period(
        request.app.async_pool, country_id, start_date, end_date, stream
    )
    return response


@router.get("/{alpha_2}/topic_rankings_by_domain/")
async def get_topic_rankings_by_domain_in_period_for_country(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int, 
    end_date: int
):
    try:
        country_id = int(request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    rankings = await utils.topic_rankings_by_domain_in_period(
        request.app.async_pool,
        country_id, start_date, end_date
    )
    response = defaultdict(list)
    for r in rankings:
        response[r["domain_id"]].append(r)
    return response


@router.get("/{alpha_2}/talking_points")
async def get_talking_points_for_country_in_period(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    stream: str
):
    try:
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    if stream == "tg":
        util_func = utils.tg_talking_points_with_delta
    elif stream == "mc":
        util_func = utils.mc_talking_points_with_delta
    else:
        raise fastapi.HTTPException(
            status_code=400, detail=f'{stream} stream not allowed'
        )
    response = await util_func(
        request.app.async_pool,
        country_id,
        start_date, end_date
    )
    return response


@router.get("/{alpha_2}/attention_trends")
async def get_tg_domains_for_country_in_period(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int, 
    stream: str
):
    
    try:
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    if stream == "tg":
        util_func = utils.tg_domain_prevalences_in_period_for_country
    elif stream == "mc":
        util_func = utils.mc_domain_prevalences_in_period_for_country
    else:
        raise fastapi.HTTPException(
            status_code=400, detail=f'{stream} stream not allowed'
        )
    data = await util_func(
        request.app.async_pool,
        country_id, 
        start_date, end_date
    )
    domains = request.app.domains
    by_domain = defaultdict(dict)
    response = []
    for d in data:
        by_domain[d["date"]][d["domain"]] = d["value"]
    for day in by_domain:
        day_data = {"date": day}
        for domain in domains:
            day_data[domain["domain"]] = by_domain[day].get(domain["domain"])
        response.append(day_data)
    response = sorted(response, key=lambda x: x["date"])
    return response
