import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
from fews2board import config
from fews2board.api import utils
from collections import defaultdict
import copy
from asyncio import gather
import datetime as dt


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


DOMAIN_DESCRIPTIONS = {
    1: "While food security depends on a complex variety of factors, climate and weather shocks often play a significant role in episodes of acute food insecurity. This domain monitors news coverage and conversations about various types of climatic events.",
    2: "Conflict is a significant driver of acute food insecurity. This domain monitors different representations of conflict types to capture public perceptions, concerns, and lived experiences described in digital spaces.",
    3: "Disease outbreaks and epidemics in both humans and animals can impact food security and market functioning. This domain monitors news coverage and conversations about various types of diseases.",
    4: "Functioning governance structures are essential to respond to potential crises. This domain monitors public perceptions of aid, market and trade policies, as well as corruption.",
    5: "Markets are a vital source of food and income for people around the world. This domain monitors news coverage and conversations about both macro and micro markets, trade, and price trends.",
    6: "This domain monitors news coverage and conversations about various agricultural and socio-economic indicators related to three of the four pillars of food security: food availability, food access, and food utilization.",
    7: "This domain monitors public perceptions about topics related to food security status, health, and nutrition indicators, as well as concepts related to livelihood strategies."

}

def averages(d):
    for k, v in d.items():
        if isinstance(v, dict):
            averages(v)
        else:
            new_v = {"value": sum([x["value"] for x in v]) / len(v)}
            if "topic_names" in v[0]:
                new_v["topic_names"] = list(set([x for t in v for x in t["topic_names"]]))
            d[k] = new_v


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def read_landing(
    request: fastapi.Request
):  
    nested_dicts = lambda: defaultdict(nested_dicts)
    map_input = nested_dicts()
    global_date_range = await utils.date_ranges_overall(request.app.async_pool, streams=['tg', 'mc'])
    max_date_id = global_date_range[0]["max_date"]
    max_datetime = dt.datetime.strptime(str(max_date_id), '%Y%m%d')
    min_datetime = max_datetime - dt.timedelta(days=7)
    start_date = int(min_datetime.strftime("%Y%m%d"))
    end_date = max_date_id
    
    sql_coros = [
        utils.get_framework(request.app.async_pool),
        utils.layers_data_for_given_time_period(request.app.async_pool, start_date, end_date),
    ]
    sql_result = await gather(*sql_coros)
    topics = sql_result[0]
    map_data = sql_result[1]
    map_data_dict = {x["alpha_2"]: x for x in map_data}
    domains = {t["domain_id"]: t["domain"] for t in topics}
    for r in map_data:
        val = map_input[r["domain_id"]][r["analysis"]]
        if not val:
            map_input[r["domain_id"]][r["analysis"]] = {
                "all": defaultdict(list), 
                "tg": defaultdict(list), 
                "mc": defaultdict(list)
            }

        for k in ["all", "tg", "mc"]:
            if k == "all":
                if r["analysis"] != "anomaly":
                    map_input[r["domain_id"]][r["analysis"]][k][r["alpha_2"]].append(
                        {"value": r["value"]}
                    )
                else:
                    t_names = r["topic_names"] if r["topic_names"] else []
                    map_input[r["domain_id"]][r["analysis"]][k][r["alpha_2"]].append(
                        {"value": r["value"], "topic_names": t_names})
            elif k == r["data_stream"]:
                if r["analysis"] != "anomaly":

                    map_input[r["domain_id"]][
                        r["analysis"]][k][r["alpha_2"]] = [{"value": r["value"]}]
                else:
                    t_names = r["topic_names"] if r["topic_names"] else []
                    map_input[r["domain_id"]][r["analysis"]][k][r["alpha_2"]] = [
                        {"value": r["value"], "topic_names": t_names}
                    ]
                
    d = copy.deepcopy(map_input)
    averages(d)
    
    data = {
        "request": request,
        "topics": topics,
        "map_data": map_data,
        "domains": domains,
        "domains_descriptions": DOMAIN_DESCRIPTIONS,
        "map_data_dict": map_data_dict,
        "map_input": map_input,
        "avg_input": d,
        "countries": request.app.countries,
        "fews_countries": config.FEWS_COUNTRIES,
        "date_range": [min_datetime.strftime("%Y-%m-%d"), max_datetime.strftime("%Y-%m-%d")],
        "date_range_int": [start_date, end_date],
        "version": config.VERSION
    }
    
    return templates.TemplateResponse(
        
        "landing.html", data
    )