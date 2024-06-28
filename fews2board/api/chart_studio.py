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