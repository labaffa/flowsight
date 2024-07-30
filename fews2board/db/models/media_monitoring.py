from fews2board.db.models import MyBase
import sqlalchemy as sa
from fews2board import config
from sqlalchemy.dialects.postgresql import TIMESTAMP


class MCStory(MyBase):
    __tablename__ = "mc_story"

    id = sa.Column(sa.String, primary_key=True, autoincrement=False)
    media_name = sa.Column(sa.String, nullable=True)
    media_url = sa.Column(sa.String, nullable=True)
    title = sa.Column(sa.String, nullable=True)
    publish_date = sa.Column(sa.DateTime)
    url = sa.Column(sa.String, nullable=False)
    language = sa.Column(sa.String, nullable=True)
    indexed_date = sa.Column(sa.DateTime, nullable=True)
    country_id = sa.Column(sa.Integer, nullable=False, default=716)


class MCSentiment(MyBase):
    __tablename__ = "mc_sentiment"

    story_id = sa.Column(sa.String, primary_key=True, autoincrement=False)
    sentiment = sa.Column(sa.Float)
    anger = sa.Column(sa.Integer, nullable=True)
    anticipation = sa.Column(sa.Integer, nullable=True)
    disgust = sa.Column(sa.Integer, nullable=True)
    fear = sa.Column(sa.Integer, nullable=True)
    joy = sa.Column(sa.Integer, nullable=True)
    sadness = sa.Column(sa.Integer, nullable=True)
    surprise = sa.Column(sa.Integer, nullable=True)
    trust = sa.Column(sa.Integer, nullable=True)
    negative = sa.Column(sa.Integer, nullable=True)
    positive = sa.Column(sa.Integer, nullable=True)
    country_id = sa.Column(sa.Integer)
    date_id = sa.Column(sa.Integer)


class MCTopicId(MyBase):
    __tablename__ = "mc_topic_id"

    story_id = sa.Column(sa.String, primary_key=True)
    topic_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_norm_prevalence = sa.Column(sa.Float)


class MCTopicIdPositive(MyBase):
    __tablename__ = "mc_topic_id_positive"

    story_id = sa.Column(sa.String, primary_key=True)
    topic_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_norm_prevalence = sa.Column(sa.Float)
    country_id = sa.Column(sa.Integer)
    date_id = sa.Column(sa.Integer)


def MCStoryModelCreator(alpha2):
    tablename = f'mc_story_{alpha2.lower()}'
    modelname = tablename.upper()
    attributes = {
        "__tablename__": tablename,
        "__table_args__": (
            sa.Index(f"mc_story_timestamp_{alpha2.lower()}", "publish_date"),
            sa.Index(f"mc_story_country_id_{alpha2.lower()}", "country_id")
        ),
        "id": sa.Column(sa.String, primary_key=True, nullable=False, autoincrement=False),
        "media_name": sa.Column(sa.String, nullable=True),
        "media_url": sa.Column(sa.String, nullable=True),
        "title": sa.Column(sa.String, nullable=True),
        "publish_date": sa.Column(sa.DateTime),
        "url": sa.Column(sa.String, nullable=False),
        "language": sa.Column(sa.String, nullable=True),
        "indexed_date": sa.Column(sa.DateTime, nullable=True),
        "country_id": sa.Column(sa.Integer, nullable=False),
        "inserted": sa.Column(TIMESTAMP(timezone=True), server_default=sa.func.now()),
        "flow_id": sa.Column(sa.String),
        "detected_language": sa.Column(sa.String, nullable=True),
        "body_en": sa.Column(sa.String, nullable=True),
        "translation_flow_id": sa.Column(sa.String, nullable=True),
        "translation_error": sa.Column(sa.String, nullable=True)
    }
    x = type(modelname, (MyBase,), attributes)
    return x


MCStoryCountry = {}

for code in config.FEWS_COUNTRIES:
    MCStoryCountry[code] = MCStoryModelCreator(code)

