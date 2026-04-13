from inspect import getsourcefile
import os
import tomli
from dotenv import load_dotenv

load_dotenv()

VERSION = "12"
DEFAULT_COUNTRY_ALPHA_2 = "sd"

COLOR_SCHEMES = {
    "atlas": {
        "nav_bg": "#10263a",
        "surface": "#173753",
        "page_bg": "#0b1522",
        "page_bg_alt": "#13283d",
        "accent": "#f59e0b",
        "accent_soft": "#fde68a",
        "accent_surface": "rgba(253, 230, 138, 0.16)",
        "button_text": "#111827",
        "text": "#f8fafc",
        "muted": "#cbd5e1",
        "card": "#274765",
        "border_subtle": "rgba(248, 250, 252, 0.16)",
    },
    "nile": {
        "nav_bg": "#0f2f2d",
        "surface": "#164743",
        "page_bg": "#081816",
        "page_bg_alt": "#11302d",
        "accent": "#d6b25e",
        "accent_soft": "#f2deaa",
        "accent_surface": "rgba(242, 222, 170, 0.18)",
        "button_text": "#13211f",
        "text": "#effcf8",
        "muted": "#b7d4cd",
        "card": "#215955",
        "border_subtle": "rgba(239, 252, 248, 0.14)",
    },
    "clay": {
        "nav_bg": "#3b211a",
        "surface": "#5a3125",
        "page_bg": "#1d110d",
        "page_bg_alt": "#40231b",
        "accent": "#e07a4f",
        "accent_soft": "#f2c2a8",
        "accent_surface": "rgba(242, 194, 168, 0.18)",
        "button_text": "#2b1711",
        "text": "#fff7f2",
        "muted": "#dec3b8",
        "card": "#714030",
        "border_subtle": "rgba(255, 247, 242, 0.14)",
    },
}

DEFAULT_COLOR_SCHEME = "atlas"
ACTIVE_COLOR_SCHEME = os.getenv(
    "FLOWSIGHT_COLOR_SCHEME", DEFAULT_COLOR_SCHEME
).strip().lower()
if ACTIVE_COLOR_SCHEME not in COLOR_SCHEMES:
    allowed_schemes = ", ".join(sorted(COLOR_SCHEMES))
    raise RuntimeError(
        "Unsupported FLOWSIGHT_COLOR_SCHEME "
        f"'{ACTIVE_COLOR_SCHEME}'. Allowed values: {allowed_schemes}."
    )

BRANDING = {
    "name": "FlowSight",
    "tagline": "Human Mobility Multi-Modal Dashboard",
    "meta_title": "FlowSight",
    "nav_title": "FlowSight",
    "nav_subtitle": "Human Mobility Multi-Modal Dashboard",
    "home_label": "Sudan Dashboard",
    "studio_label": "Chart Studio",
    "footer_summary": (
        "FlowSight brings together social, media, and SSI signals "
        "to support multimodal human mobility analysis."
    ),
    "footer_links": [
        {"label": "Sudan Dashboard", "href": "/"},
        {"label": "Chart Studio", "href": "/studio"},
    ],
    "colors": COLOR_SCHEMES[ACTIVE_COLOR_SCHEME],
    "color_scheme": ACTIVE_COLOR_SCHEME,
    "color_scheme_options": tuple(sorted(COLOR_SCHEMES)),
}

this_path = os.path.abspath(getsourcefile(lambda:0))
this_folder = os.path.dirname(this_path)
repo_folder = os.path.dirname(os.path.dirname(this_folder))
SOURCE_FOLDER = os.path.dirname(this_folder)


toml_path = os.path.join(this_folder, "config.toml")  # move luigi.toml out of src
with open(toml_path, "rb") as f:
    conf = tomli.load(f)

data_folder_level = SOURCE_FOLDER


PG_HOST = os.getenv("PG_HOST")
PG_PORT = os.getenv("PG_PORT")
PG_DATABASE = os.getenv("PG_DATABASE")
PG_USER = os.getenv("PG_USER")
PG_PASSWORD = os.getenv("PG_PASSWORD")
PG_URL = f'postgresql+psycopg2://{PG_USER}:{PG_PASSWORD}@{PG_HOST}/{PG_DATABASE}'
PG_ASYNC_URL = f'postgresql+asyncpg://{PG_USER}:{PG_PASSWORD}@{PG_HOST}/{PG_DATABASE}'
PG_SCHEMA_NAME = os.getenv("PG_SCHEMA_NAME")

FEWS_COUNTRIES_FROM_ETL = {
    "af": {"telecatch_collection": "afghanistan", "mediacloud_collection": 38376339},
    "ao": {"telecatch_collection": "angola", "mediacloud_collection": 34412237},
    "bj": {"telecatch_collection": "benin", "mediacloud_collection": 34412177},
    "bf": {"telecatch_collection": "burkina faso", "mediacloud_collection": 34412047},
    "bi": {"telecatch_collection": "burundi", "mediacloud_collection": 38379378},
    "cm": {"telecatch_collection": "cameroon", "mediacloud_collection": 38379387},
    "td": {"telecatch_collection": "chad", "mediacloud_collection": 38379436},
    "dj": {"telecatch_collection": "djibouti", "mediacloud_collection": 34412350},
    "cd": {"telecatch_collection": "drc", "mediacloud_collection": 34412042},
    "sv": {"telecatch_collection": "el salvador", "mediacloud_collection": 34412288},
    "et": {"telecatch_collection": "ethiopia", "mediacloud_collection": 34412034},
    "gh": {"telecatch_collection": "ghana", "mediacloud_collection": 34412202},
    "gt": {"telecatch_collection": "guatemala", "mediacloud_collection": 34412063},
    "gn": {"telecatch_collection": "guinea", "mediacloud_collection": 34412263},
    "ht": {"telecatch_collection": "haiti", "mediacloud_collection": 34412303},
    "hn": {"telecatch_collection": "honduras", "mediacloud_collection": 34412466},
    "ci": {"telecatch_collection": "ivory coast", "mediacloud_collection": 34412173},
    "ke": {"telecatch_collection": "kenya", "mediacloud_collection": 34412126},
    "lb": {"telecatch_collection": "lebanon", "mediacloud_collection": 34412343},
    "ly": {"telecatch_collection": "libya", "mediacloud_collection": 38380279},
    "mg": {"telecatch_collection": "madagascar", "mediacloud_collection": 34412370},
    "mw": {"telecatch_collection": "malawi", "mediacloud_collection": 34412402},
    "ml": {"telecatch_collection": "mali", "mediacloud_collection": 34412222},
    "mr": {"telecatch_collection": "mauritania", "mediacloud_collection": 34412134},
    "mz": {"telecatch_collection": "mozambique", "mediacloud_collection": 34412248},
    "ni": {"telecatch_collection": "nicaragua", "mediacloud_collection": 34412113},
    "ne": {"telecatch_collection": "niger", "mediacloud_collection": 34412253},
    "ng": {"telecatch_collection": "nigeria", "mediacloud_collection": 38376341},
    "pg": {"telecatch_collection": "papua new guinea", "mediacloud_collection": 34412399},
    "rw": {"telecatch_collection": "rwanda", "mediacloud_collection": 34412053},
    "sn": {"telecatch_collection": "senegal", "mediacloud_collection": 38380807},
    "sl": {"telecatch_collection": "sierra leone", "mediacloud_collection": 34412308},
    "so": {"telecatch_collection": "somalia", "mediacloud_collection": 34412155},
    "ss": {"telecatch_collection": "south sudan", "mediacloud_collection": 34412439},
    "sd": {"telecatch_collection": "sudan", "mediacloud_collection": 34412379},
    "tj": {"telecatch_collection": "tajikistan", "mediacloud_collection": 34412129},
    "tz": {"telecatch_collection": "tanzania", "mediacloud_collection": 34412085},
    "tg": {"telecatch_collection": "togo", "mediacloud_collection": 34412192},
    "ug": {"telecatch_collection": "uganda", "mediacloud_collection": 34412251},
    "ve": {"telecatch_collection": "venezuela", "mediacloud_collection": 34412387},
    "ye": {"telecatch_collection": "yemen", "mediacloud_collection": 34412100},
    "zm": {"telecatch_collection": "zambia", "mediacloud_collection": 34412396},
    "zw": {"telecatch_collection": "zimbabwe", "mediacloud_collection": 34412406}
}
FEWS_COUNTRIES = list(FEWS_COUNTRIES_FROM_ETL.keys())
