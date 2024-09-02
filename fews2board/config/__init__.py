from inspect import getsourcefile
import os
import tomli
from dotenv import load_dotenv

load_dotenv()

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
    "ht": {"telecatch_collection": "haiti", "mediacloud_collection": 34412303},
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
    "ng": {"telecatch_collection": "nigeria", "mediacloud_collection": 38376341},
    "rw": {"telecatch_collection": "rwanda", "mediacloud_collection": 34412053},
    "sn": {"telecatch_collection": "senegal", "mediacloud_collection": 38380807},
    "so": {"telecatch_collection": "somalia", "mediacloud_collection": 34412155},
    "sd": {"telecatch_collection": "sudan", "mediacloud_collection": 34412379},
    "tj": {"telecatch_collection": "tajikistan", "mediacloud_collection": 34412129},
    "tz": {"telecatch_collection": "tanzania", "mediacloud_collection": 34412085},
    "tg": {"telecatch_collection": "togo", "mediacloud_collection": 34412192},
    "ve": {"telecatch_collection": "venezuela", "mediacloud_collection": 34412387},
    "zm": {"telecatch_collection": "zambia", "mediacloud_collection": 34412396},
    "zw": {"telecatch_collection": "zimbabwe", "mediacloud_collection": 34412406}
}
FEWS_COUNTRIES = list(FEWS_COUNTRIES_FROM_ETL.keys())