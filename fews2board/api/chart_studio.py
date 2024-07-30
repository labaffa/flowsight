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
import json
import datetime as dt
from asyncio import gather


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")
EMOTIONS = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'trust']


@router.get("/studio_line_chart")
async def get_studio_time_series(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    fields,
    countries, 
    conditions: str=""
):
    conditions = json.loads(conditions) if conditions else None
    fields = json.loads(fields)
    countries = json.loads(countries)
    combined_fields = []
    for f in fields:
        for c in countries:
            c_field = {**f, "country_id": int(c)}
            combined_fields.append(c_field)

    sql_coros = []
    for x in combined_fields:
        if x["stream"] == "si":
            sql_coros.append(utils.chart_studio_time_series_from_ssi(
                request.app.async_pool, x["country_id"], start_date, end_date, conditions
            ))
        else:
            sql_coros.append(utils.chart_studio_time_series_from_stream(
                request.app.async_pool, conditions, x["country_id"], start_date, end_date, x
                )
            )
    sql_responses = await gather(*sql_coros)
    data = [x for r in sql_responses for x in r]
    by_field = defaultdict(dict)
    fields_set = set()
    response = []
    for d in data:
        if '- emotion -' in d["field"].lower():
            cou, _, suffix = d["field"].split("-")
            for emotion, value in d["value"].items():
                field = cou.strip() + f' - {emotion} - ' + suffix.strip()
                by_field[d["date"]][field] = value
                fields_set.add(field)
        else:
            by_field[d["date"]][d["field"]] = d["value"]
            fields_set.add(d["field"])
    for day in by_field:
        day_data = {"date": day}
        for field in fields_set:
            day_data[field] = by_field[day].get(field)
        response.append(day_data)
    return response


@router.get("/studio_bar_chart")
async def get_studio_time_series(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    fields,
    countries, 
    conditions: str=""
):
    conditions = json.loads(conditions) if conditions else None
    fields = json.loads(fields)
    countries = json.loads(countries)
    combined_fields = []
    for f in fields:
        for c in countries:
            c_field = {**f, "country_id": int(c)}
            combined_fields.append(c_field)
    sql_coros = []
    for x in combined_fields:
        if x["stream"] == "si":
            sql_coros.append(utils.chart_studio_bar_chart_from_ssi(
                request.app.async_pool, x["country_id"], start_date, end_date, conditions
            ))
        else:
            sql_coros.append(utils.chart_studio_bar_chart_from_stream(
                request.app.async_pool, conditions, x["country_id"], start_date, end_date, x
                )
            )
    sql_responses = await gather(*sql_coros)
    data = [x for r in sql_responses for x in r]
    response = []
    for d in data:
        if ('- emotion -' in d["field"].lower()) or ('- sentiment -' in d["field"].lower()):
            cou, _, suffix = d["field"].split("-")
            for emotion, value in d["frequency"].items():
                field = cou.strip() + f' - {emotion} - ' + suffix.strip()
                response.append({"field": field, "frequency": value})
        else:
            response.append(d)
    return response


@router.get("/tg_messages_from_many_countries")
async def get_telegram_messages_from_many_countries(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    countries,
    conditions: str="",
    sorted_by: str="date",
    limit: int = 10,
    offset: int = 0
):
    conditions = json.loads(conditions) if conditions else None
    countries = json.loads(countries)
    sql_coros = []
    countries_by_id = request.app.countries_by_id
    for c in countries:
        alpha_2 = countries_by_id.get(int(c), {}).get("alpha_2")
        if alpha_2 is None:
            print(f'{c} code is not present in country list.')
            continue
        
        sql_coros.append(utils.tg_messages_no_duplicates(
            request.app.async_pool, alpha_2.lower(), start_date, end_date, sorted_by, limit, conditions, offset,
        ))
        
    sql_responses = await gather(*sql_coros)
    response = [x for r in sql_responses for x in r]
    return response


@router.get("/mc_stories_from_many_countries")
async def get_telegram_messages_from_many_countries(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    countries,
    conditions: str="",
    sorted_by: str="date",
    limit: int = 10,
    offset: int = 0
):
    conditions = json.loads(conditions) if conditions else None
    countries = json.loads(countries)
    sql_coros = []
    for c in countries:
        alpha_2 = request.app.countries_by_id.get(int(c), {}).get("alpha_2")
        if alpha_2 is None:
            print(f'{c} code is not present in country list.')
            continue
        sql_coros.append(utils.mc_stories(
            request.app.async_pool, alpha_2.lower(), start_date, end_date, sorted_by, limit, conditions, offset,
        ))
    sql_responses = await gather(*sql_coros)
    response = [x for r in sql_responses for x in r]
    return response