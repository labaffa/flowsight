from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fews2board import ui, config, api
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
from fews2board.db.utils import get_conn_str


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.async_pool = AsyncConnectionPool(conninfo=get_conn_str())
    yield
    await app.async_pool.close()


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
# app.include_router(ui.misc.router)
# app.include_router(api.landing.router, prefix="/api")


if __name__ == "__main__":
    pass
