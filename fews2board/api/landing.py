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


@router.get("/latest_by_domain")
async def get_latest_by_domain(
    request: fastapi.Request,
    latest_update_day: str
):  
    try:
        latest_update_day = parse(latest_update_day)
        latest_update_day = int(latest_update_day.strftime("%Y%m%d"))
    except Exception:
        raise fastapi.HTTPException(
            status_code=400,
            detail="Day must be a valid parsable datetime"
        )
    q = (
        f'''
        SELECT 
            ts.date_id as date_id
            , ts.country_id as country_id
            , ts.domain_id as domain_id
            , ts.sentiment as value
            , 'sentiment' as source
        from {tablename(TgSentimentDayDomainAgg)} ts
        where ts.date_id = {latest_update_day}

        UNION ALL

        SELECT 
            tti.date_id as date_id
            , tti.country_id as country_id
            , tti.domain_id as domain_id
            , tti.topic_norm_prevalence as value
            , 'attention' as source
        from {tablename(TopicIdDayDomainAggTg)} as tti
        where tti.date_id = {latest_update_day};
        '''
        )
    async with request.app.async_pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return JSONResponse([dict(r) for r in result])


@router.get('/framework')
async def get_landing_framework(request: fastapi.Request):
    result = await utils.get_framework(request.app.async_pool)
    return result


@router.get('/latest_attention_sentiment_per_domain')
async def get_latest_attention_and_sentiment_per_domain(
    request: fastapi.Request
):
    
    response = await utils.latest_attention_and_sentiment_per_domain(request.app.async_pool)
    return response


@router.get('/top_topics_latest')
async def get_top_topics_on_latest_update(
    request: fastapi.Request,
    top_n: int = 3
):
    
    response = await utils.top_topics_on_latest(request.app.async_pool, top_n)
    return response


@router.get('/latest_sentiment_by_country')
async def get_latest_sentiment_by_country(
    request: fastapi.Request
):
    
    response = await utils.latest_sentiment_score(request.app.async_pool)
    return response


@router.get('/tooltip_stats')
async def get_stats_for_map_tooltip(
    request: fastapi.Request
):
    top_topics = await utils.top_topics_on_latest(request.app.async_pool)
    delta_sentiment = await utils.latest_sentiment_with_delta(request.app.async_pool)
    response = {
        "top_topics": top_topics,
        "sentiment": delta_sentiment
    }
    return response




