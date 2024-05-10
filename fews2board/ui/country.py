import fastapi
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from fews2board import config
from fews2board.db.db_setup import get_async_db
from fews2board.api import utils
from collections import defaultdict
import copy


router = fastapi.APIRouter()
templates = Jinja2Templates(directory="fews2board/templates")


@router.get("/country/{alpha_2}", response_class=HTMLResponse, include_in_schema=False)
async def read_landing(
    request: fastapi.Request, alpha_2: str
): 
    data = {"request": request}
    return templates.TemplateResponse(
        "country.html", data
    )