import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
from fews2board import config
from fews2board.api import utils
from collections import defaultdict
import copy

router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


def averages(d):
    for k, v in d.items():
        if isinstance(v, dict):
            averages(v)
        else:
            d[k] = sum(v)/len(v)


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def read_landing(
    request: fastapi.Request
):  
    nested_dicts = lambda: defaultdict(nested_dicts)
    map_input = nested_dicts()
    
    topics = await utils.get_framework(request.app.async_pool)
    map_data = await utils.latest_attention_and_sentiment_per_domain(request.app.async_pool)
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
                map_input[r["domain_id"]][r["analysis"]][k][r["alpha_2"]].append(
                    r["value"]
                )
            elif k == r["data_stream"]:
                map_input[r["domain_id"]][
                    r["analysis"]][k][r["alpha_2"]] = [r["value"]]
            
                
    d = copy.deepcopy(map_input)
    averages(d)
    data = {
        "request": request,
        "topics": topics,
        "map_data": map_data,
        "domains": domains,
        "map_data_dict": map_data_dict,
        "map_input": map_input,
        "avg_input": d
    }
    
    return templates.TemplateResponse(
        
        "landing.html", data
    )