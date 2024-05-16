from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fews2board import ui, config, api
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
from fews2board.db.utils import get_conn_str
from fews2board.api import utils
from psycopg.rows import dict_row



@asynccontextmanager
async def lifespan(app: FastAPI):
    app.async_pool = AsyncConnectionPool(conninfo=get_conn_str(), open=False, min_size=20)
    await app.async_pool.open()
    # async with app.async_pool.connection() as conn:
    #     app.conn = conn
    #     async with conn.cursor(row_factory=dict_row) as cur:
    #         app.cur = cur
    countries_in_db = await utils.get_country_codes(app.async_pool)
    domains_in_db = await utils.get_domains(app.async_pool)
    app.countries = {c["alpha_2"].lower().strip(): c for c in countries_in_db}
    app.domains = domains_in_db
    yield
    await app.async_pool.close()
    app.countries.clear()


app = FastAPI(
    title="Dashboard for phase 2",
    description="Extract useful info from Telegram, News and Google Trends",
    version="0.0.1",
    contact={
        "name": "Giosue",
        "email": "giosue.ruscica@gmail.com",
    },
    license_info={
        "name": "MIT",
    },
    lifespan=lifespan,
    default_response_class=ORJSONResponse
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory="fews2board/static"), name="static")



app.include_router(ui.landing.router)
app.include_router(api.landing_router)
app.include_router(ui.country.router)
app.include_router(api.country_router, tags=["country"])
app.include_router(api.misc_router, tags=["Util"])
# app.include_router(ui.misc.router)
# app.include_router(api.landing.router, prefix="/api")


if __name__ == "__main__":
    pass
