from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from flowsight import ui, config, api
from contextlib import asynccontextmanager
from flowsight.api import utils
from flowsight.db.startup import (
    DatabaseStartupError,
    classify_database_error,
    close_pool,
    load_database_settings,
    open_verified_pool,
    ready_payload,
)



@asynccontextmanager
async def lifespan(app: FastAPI):
    app.default_country_alpha_2 = config.DEFAULT_COUNTRY_ALPHA_2
    app.async_pool = None
    app.countries = {}
    app.countries_by_id = {}
    app.domains = []
    app.default_country = None
    app.default_country_id = None
    app.state.db_settings = None
    app.state.db_status = {
        "status": "starting",
        "database": {
            "ready": False,
            "kind": "starting",
            "message": "Database startup probe has not completed yet.",
        },
    }

    settings = None
    try:
        settings = load_database_settings()
        app.state.db_settings = settings
        app.async_pool = await open_verified_pool(
            settings,
            min_size=1,
            max_size=20,
        )

        countries_in_db = await utils.get_country_codes(app.async_pool)
        domains_in_db = await utils.get_domains(app.async_pool)
        app.countries = {c["alpha_2"].lower().strip(): c for c in countries_in_db}
        app.countries_by_id = {c["country_id"]: c for c in countries_in_db}
        app.domains = domains_in_db

        default_country = app.countries.get(app.default_country_alpha_2)
        if default_country is None:
            raise DatabaseStartupError(
                "invalid_schema",
                (
                    "Database startup failed: FlowSight requires Sudan "
                    f"(alpha_2='{app.default_country_alpha_2}') in the country table."
                ),
            )

        app.default_country = default_country
        app.default_country_id = int(default_country["country_id"])
        app.state.db_status = ready_payload(settings)

        yield
    except DatabaseStartupError as exc:
        app.state.db_status = exc.to_payload()
        raise RuntimeError(str(exc)) from exc
    except Exception as exc:
        db_error = classify_database_error(exc, settings)
        app.state.db_status = db_error.to_payload()
        raise RuntimeError(str(db_error)) from exc
    finally:
        await close_pool(app.async_pool)
        app.async_pool = None
        app.countries.clear()
        app.countries_by_id.clear()
        app.domains.clear()


app = FastAPI(
    title=config.BRANDING["name"],
    description=config.BRANDING["tagline"],
    version="0.0.1",
    contact={
        "name": config.BRANDING["name"],
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
app.mount("/static", StaticFiles(directory="flowsight/static"), name="static")



app.include_router(api.studio_router)
app.include_router(ui.country.router)
app.include_router(ui.chart_studio.router)
app.include_router(api.country_router, tags=["country"])
app.include_router(api.misc_router, tags=["Util"])
# app.include_router(ui.misc.router)
# app.include_router(api.landing.router, prefix="/api")


if __name__ == "__main__":
    pass
