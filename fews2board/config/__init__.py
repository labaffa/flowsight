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
FEWS_COUNTRIES = [
    "af",
    "ao",
    "bj",
    "bf",
    "bi",
    "cm",
    "td",
    "sv",
    "et",
    "gt",
    "ht",
    "ke",
    "ly",
    "mz",
    "ng",
    "sn",
    "tg",
    "ve",
    "zw"
]

