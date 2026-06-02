import datetime as dt
import json
from asyncio import gather
from collections import defaultdict

import fastapi

from flowsight.api import human_mobility_utils, utils


router = fastapi.APIRouter()


def _default_country_id(request: fastapi.Request) -> int:
    return request.app.default_country_id


def _default_country_alpha_2(request: fastapi.Request) -> str:
    return request.app.default_country_alpha_2


def _is_hm_scope(scope: str) -> bool:
    return (scope or "hm").strip().lower() != "global"


@router.get("/studio_line_chart")
async def get_studio_time_series(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    fields,
    countries,
    conditions: str = "",
    scope: str = "hm",
):
    conditions = json.loads(conditions) if conditions else None
    fields = json.loads(fields)
    country_id = _default_country_id(request)
    alpha_2 = _default_country_alpha_2(request)
    combined_fields = [{**field, "country_id": int(country_id)} for field in fields]

    sql_coros = []
    for field in combined_fields:
        if field["stream"] == "si":
            sql_coros.append(
                utils.chart_studio_time_series_from_ssi(
                    request.app.async_pool, field["country_id"], start_date, end_date, conditions
                )
            )
        elif _is_hm_scope(scope):
            sql_coros.append(
                human_mobility_utils.chart_studio_time_series_from_stream(
                    request.app.async_pool,
                    conditions,
                    alpha_2,
                    field["country_id"],
                    start_date,
                    end_date,
                    field,
                )
            )
        else:
            sql_coros.append(
                utils.chart_studio_time_series_from_stream(
                    request.app.async_pool,
                    conditions,
                    field["country_id"],
                    start_date,
                    end_date,
                    field,
                )
            )
    sql_responses = await gather(*sql_coros)
    data = [item for response in sql_responses for item in response]
    if not data:
        return []

    by_field = defaultdict(dict)
    start_date_dt = dt.datetime.strptime(str(start_date), "%Y%m%d").date()
    end_date_dt = dt.datetime.strptime(str(end_date), "%Y%m%d").date()
    if "- emotion -" in data[0]["field"].lower():
        prefix, _, suffix = data[0]["field"].split("-")
        emotion = next(iter(data[0]["value"].items()))
        placeholder_field = prefix.strip() + f" - {emotion} - " + suffix.strip()
    else:
        placeholder_field = data[0]["field"]

    current_date = start_date_dt
    while current_date <= end_date_dt:
        by_field[current_date][placeholder_field] = None
        current_date += dt.timedelta(days=1)

    fields_set = set()
    response = []
    for row in data:
        if "- emotion -" in row["field"].lower():
            prefix, _, suffix = row["field"].split("-")
            for emotion, value in row["value"].items():
                field_name = prefix.strip() + f" - {emotion} - " + suffix.strip()
                by_field[row["date"]][field_name] = value
                fields_set.add(field_name)
        else:
            by_field[row["date"]][row["field"]] = row["value"]
            fields_set.add(row["field"])

    for day in by_field:
        day_data = {"date": day}
        for field_name in fields_set:
            day_data[field_name] = by_field[day].get(field_name)
        response.append(day_data)
    return response


@router.get("/studio_bar_chart")
async def get_studio_bar_chart(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    fields,
    countries,
    conditions: str = "",
    scope: str = "hm",
):
    conditions = json.loads(conditions) if conditions else None
    fields = json.loads(fields)
    country_id = _default_country_id(request)
    alpha_2 = _default_country_alpha_2(request)
    combined_fields = [{**field, "country_id": int(country_id)} for field in fields]

    sql_coros = []
    for field in combined_fields:
        if field["stream"] == "si":
            sql_coros.append(
                utils.chart_studio_bar_chart_from_ssi(
                    request.app.async_pool, field["country_id"], start_date, end_date, conditions
                )
            )
        elif _is_hm_scope(scope):
            sql_coros.append(
                human_mobility_utils.chart_studio_bar_chart_from_stream(
                    request.app.async_pool,
                    conditions,
                    alpha_2,
                    field["country_id"],
                    start_date,
                    end_date,
                    field,
                )
            )
        else:
            sql_coros.append(
                utils.chart_studio_bar_chart_from_stream(
                    request.app.async_pool,
                    conditions,
                    field["country_id"],
                    start_date,
                    end_date,
                    field,
                )
            )
    sql_responses = await gather(*sql_coros)
    data = [item for response in sql_responses for item in response]
    response = []
    for row in data:
        if ("- emotion -" in row["field"].lower()) or ("- sentiment -" in row["field"].lower()):
            prefix, _, suffix = row["field"].split("-")
            for emotion, value in row["frequency"].items():
                field_name = prefix.strip() + f" - {emotion} - " + suffix.strip()
                response.append({"field": field_name, "frequency": value})
        else:
            response.append(row)
    return response


@router.get("/tg_messages_from_many_countries")
async def get_telegram_messages(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    countries,
    conditions: str = "",
    sorted_by: str = "date",
    limit: int = 10,
    offset: int = 0,
    scope: str = "hm",
):
    conditions = json.loads(conditions) if conditions else None
    if _is_hm_scope(scope):
        return await human_mobility_utils.tg_messages(
            request.app.async_pool,
            _default_country_alpha_2(request),
            start_date,
            end_date,
            sorted_by,
            limit,
            conditions,
            offset,
        )
    return await utils.tg_messages_no_duplicates(
        request.app.async_pool,
        _default_country_alpha_2(request),
        start_date,
        end_date,
        sorted_by,
        limit,
        conditions,
        offset,
    )


@router.get("/mc_stories_from_many_countries")
async def get_mc_stories(
    request: fastapi.Request,
    start_date: int,
    end_date: int,
    countries,
    conditions: str = "",
    sorted_by: str = "date",
    limit: int = 10,
    offset: int = 0,
    scope: str = "hm",
):
    conditions = json.loads(conditions) if conditions else None
    if _is_hm_scope(scope):
        return await human_mobility_utils.mc_stories(
            request.app.async_pool,
            _default_country_alpha_2(request),
            start_date,
            end_date,
            sorted_by,
            limit,
            conditions,
            offset,
        )
    return await utils.mc_stories(
        request.app.async_pool,
        _default_country_alpha_2(request),
        start_date,
        end_date,
        sorted_by,
        limit,
        conditions,
        offset,
    )
