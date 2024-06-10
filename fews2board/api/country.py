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

router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


@router.get("/{alpha_2}/domain_ranking")
async def get_domain_rank_in_period_for_country(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int, 
    end_date: int,
    stream: str,
    conditions: str=""
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
    conditions = json.loads(conditions) if conditions else None
    topic_clause = utils.generate_filter_clauses(conditions)[0]
    if not conditions:  # default
        response = await utils.domain_ranking_in_period(
            request.app.async_pool, country_id, start_date, end_date, stream
        )
    else:
        if topic_clause:
            response = await utils.hot_topics_with_topic_condition(
                request.app.async_pool, conditions, country_id, start_date, end_date, stream
            )
        else:
            response = await utils.hot_topics_without_topic_condition(
                request.app.async_pool, conditions, country_id, start_date, end_date, stream
            )
    return response


@router.get("/{alpha_2}/topic_rankings_by_domain/")
async def get_topic_rankings_by_domain_in_period_for_country(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int, 
    end_date: int
):
    """it might be broken, but it looks unused"""
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
    stream: str,
    conditions: str=""
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


@router.get("/{alpha_2}/mc_entity_in_period")
async def get_tg_domains_for_country_in_period(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int, 
    entity: str,
    limit: int=10
):
    if entity not in ["location", "person", "org", "bigram", "trigram"]:
        raise fastapi.HTTPException(
            status_code=400, detail=f'Entity {entity} not allowed'
        )
    if limit < 0:
        limit = None
    try:
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    response = await utils.mc_entity_in_period_for_country(
        request.app.async_pool, country_id, start_date, end_date, entity, limit
    )
    return response


@router.get("/{alpha_2}/ssi_series")
async def get_ssi_series(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    domain_id: int=3
):
    try:
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    response = await utils.ssi_w_series(
        request.app.async_pool, country_id, start_date, end_date, domain_id
    )
    return response


@router.get("/{alpha_2}/tg_messages")
async def get_telegram_messages(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    conditions: str="",
    sorted_by: str="date",
    limit: int = 10,
    
):
    try:    
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    conditions = json.loads(conditions) if conditions else None
    func = utils.tg_messages_no_duplicates if alpha_2 == 'zw' else utils.tg_messages
    response = await func(
        request.app.async_pool, country_id, start_date, end_date, sorted_by, limit, conditions
    )
    response = list({x["unique_id"]: x for x in response}.values())
    return response


@router.get("/{alpha_2}/filter_attention_trends")
async def get_attention_trends_on_conditions(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    conditions: str="",
    stream: str="tg"
):
    try:    
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    conditions = json.loads(conditions) if conditions else None
    # response = await utils.get_filtered_message_ids(
    #     request.app.async_pool, conditions, start_date, end_date, country_id)
    response = []
    topic_clause = utils.generate_filter_clauses(conditions)[0]
    if topic_clause:
        data = await utils.time_series_from_filtered_messages(
            request.app.async_pool, conditions, country_id, start_date, end_date, stream
        )
        by_topic = defaultdict(dict)
        topics_set = set()
        for d in data:
            by_topic[parse(str(d["date_id"])).strftime('%Y-%m-%d')][d["topic"]] = d["value"]
            topics_set.add(d["topic"])
        for day in by_topic:
            day_data = {"date": day}
            for topic in topics_set:
                day_data[topic] = by_topic[day].get(topic)
            response.append(day_data)
    else:
        data = await utils.domain_prevalences_in_period_for_country(
            request.app.async_pool, country_id, start_date, end_date, stream, conditions
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


@router.get("/{alpha_2}/mc_stories")
async def get_mediacloud_stories(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    sorted_by: str="date",
    limit: int = 10,
    conditions: str=""
):  
    conditions = json.loads(conditions) if conditions else None
    try:    
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    response = await utils.mc_stories(
        request.app.async_pool, country_id, start_date, end_date, sorted_by, limit, conditions
    )
    # remove duplicates
    response = list({x["id"]: x for x in response}.values())
    return response


@router.get("/{alpha_2}/ssi_fields_series")
async def get_ssi_series(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    domain_id: int=3
):
    try:
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    db_data = await utils.ssi_fields_series(
        request.app.async_pool, country_id, start_date, end_date, domain_id
    )
    by_date_data = defaultdict(dict)
    for item in db_data:
        date = item["date"]
        if date not in by_date_data:
            by_date_data[date]["date"] = date
        field_name = item["field"].strip().title()
        by_date_data[date][field_name] = item["value"]
    return list(by_date_data.values())


@router.get("/{alpha_2}/hot_topics_on_conditions")
async def get_hot_topics_on_conditions(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    conditions: str="",
    stream: str="tg"
):
    try:    
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    conditions = json.loads(conditions) if conditions else None
    # response = await utils.get_filtered_message_ids(
    #     request.app.async_pool, conditions, start_date, end_date, country_id)
    data = await utils.hot_topics_with_topic_condition(
        request.app.async_pool, conditions, country_id, start_date, end_date
    )
    response = data
    return response


@router.get("/{alpha_2}/talking_points_on_conditions")
async def get_talking_points_on_conditions(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    conditions: str="",
    stream:str="tg"
):
    try:    
        country_id = int(
            request.app.countries[alpha_2.strip().lower()]["country_id"])
    except KeyError:
        raise fastapi.HTTPException(
            status_code=400, detail=f"{alpha_2} is not a valid alpha_2 code"
        )
    conditions = json.loads(conditions) if conditions else None
    # response = await utils.get_filtered_message_ids(
    #     request.app.async_pool, conditions, start_date, end_date, country_id)
    data = await utils.talking_points_on_conditions(
        request.app.async_pool, conditions, country_id, start_date, end_date, stream
    )
    response = []
    nested_dicts = lambda: defaultdict(nested_dicts)

    by_domain_layer = nested_dicts()

    for d in data:
        if d["type"] == "prev":
            k = "prev_value"
        else:
            k = "latest_value"
        by_domain_layer[d["domain"]]["attention"][k] = d["attention"]
        by_domain_layer[d["domain"]]["sentiment"][k] = d["sentiment"]

    
    for domain, layer in by_domain_layer.items():
        for lname, values in layer.items():
            o = {
                "domain": domain,
                "layer": lname,
                "latest_value": values.get("latest_value"),
                "prev_value":  values.get("prev_value")
            }

            response.append(o)
    response = [x for x in response if x["latest_value"]]
    return response


@router.get("/{alpha_2}/tfidf_top_terms")
async def get_talking_points_on_conditions(
    request: fastapi.Request,
    alpha_2: str,
    start_date: int,
    end_date: int,
    stream:str="tg",
    limit: int=50
):
    data = await utils.tfidf_top_terms(
        request.app.async_pool, alpha_2, start_date, end_date, stream, limit
    )
    return data