from fews2board.db.models import MyBase
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TIMESTAMP
from fews2board import config

class TgMessage(MyBase):
    __tablename__ = "tg_message"
    __table_args__ = (
        sa.UniqueConstraint("channel_id", "message_id", name="id_message"),
    )

    unique_id = sa.Column(sa.BigInteger, primary_key=True, autoincrement=True)
    channel_id = sa.Column(sa.Integer, nullable=False)
    message_id = sa.Column(sa.Integer, nullable=False)
    username = sa.Column(sa.String, nullable=True)
    body = sa.Column(sa.String)
    timestamp = sa.Column(sa.DateTime)
    views = sa.Column(sa.Integer, nullable=True)
    media_type = sa.Column(sa.String, nullable=True)
    media_description = sa.Column(sa.String, nullable=True)
    media_filename = sa.Column(sa.String, nullable=True)
    author_type = sa.Column(sa.String, nullable=True)
    author_id = sa.Column(sa.Integer, nullable=True)
    author_username = sa.Column(sa.String, nullable=True)
    author_name = sa.Column(sa.String, nullable=True)
    reply_to_author_type = sa.Column(sa.String, nullable=True)
    reply_to_author_id = sa.Column(sa.String, nullable=True)
    reply_to_author_username = sa.Column(sa.String, nullable=True)
    fwd_from_author_type = sa.Column(sa.String, nullable=True)
    fwd_from_author_username = sa.Column(sa.String, nullable=True)
    fwd_from_author_name = sa.Column(sa.String, nullable=True)
    inserted = sa.Column(TIMESTAMP(timezone=True), server_default=sa.func.now())
    flow_id = sa.Column(sa.String)
    country_id = sa.Column(sa.Integer, nullable=True)


class TgChannel(MyBase):
    __tablename__ = "tg_channel"

    channel_id = sa.Column(sa.Integer, primary_key=True, autoincrement=False)
    url = sa.Column(sa.String, nullable=False)
    username = sa.Column(sa.String, nullable=True)
    channel_type = sa.Column(sa.String, nullable=False)
    # access_hash = sa.Column(sa.Integer, nullable=True)
    messages_count = sa.Column(sa.Integer, nullable=True)
    participants_count = sa.Column(sa.Integer, nullable=True)
    about = sa.Column(sa.String, nullable=True)
    title = sa.Column(sa.String, nullable=True)
    inserted_at = sa.Column(sa.DateTime)
    updated_at = sa.Column(sa.DateTime)
    language = sa.Column(sa.String, nullable=True)
    country = sa.Column(sa.String, nullable=True)
    category = sa.Column(sa.String, nullable=True)
    country_id = sa.Column(sa.Integer, nullable=True)


class TgSentiment(MyBase):
    __tablename__ = "tg_sentiment"

    message_unique_id = sa.Column(sa.Integer, primary_key=True, autoincrement=False)
    sentiment = sa.Column(sa.Float, nullable=True)
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


class TgTopicId(MyBase):
    __tablename__ = "tg_topic_id"

    message_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_norm_prevalence = sa.Column(sa.Float)


class TgTopicIdPositive(MyBase):
    __tablename__ = "tg_topic_id_positive"

    message_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_norm_prevalence = sa.Column(sa.Float)
    country_id = sa.Column(sa.Integer)
    date_id = sa.Column(sa.Integer)


def TgMessageModelCreator(alpha2):
    tablename = f'tg_message_{alpha2.lower()}'
    modelname = tablename.upper()
    attributes = {
        "__tablename__": tablename,
        "__table_args__": (
           sa.UniqueConstraint("channel_id", "message_id", name=f"id_message_{alpha2.lower()}"),
            sa.Index(f"tg_message_timestamp_{alpha2.lower()}", "timestamp"),
        ),
        "unique_id": sa.Column(sa.BigInteger, primary_key=True, nullable=False),
        "channel_id": sa.Column(sa.BigInteger, nullable=False),
        "message_id":  sa.Column(sa.BigInteger, nullable=False),
        "username": sa.Column(sa.String, nullable=True),
        "body": sa.Column(sa.String, nullable=True),
        "timestamp": sa.Column(sa.DateTime),
        "views": sa.Column(sa.Integer, nullable=True),
        "media_type": sa.Column(sa.String, nullable=True),
        "media_description": sa.Column(sa.String, nullable=True),
        "media_filename": sa.Column(sa.String, nullable=True),
        "author_type": sa.Column(sa.String, nullable=True),
        "author_id": sa.Column(sa.BigInteger, nullable=True),
        "author_username": sa.Column(sa.String, nullable=True),
        "author_name": sa.Column(sa.String, nullable=True),
        "reply_to_author_type": sa.Column(sa.String, nullable=True),
        # reply_to_author_id = sa.Column(sa.BigInteger, nullable=True)
        "reply_to_author_username": sa.Column(sa.String, nullable=True),
        "fwd_from_author_type": sa.Column(sa.String, nullable=True),
        "fwd_from_author_username": sa.Column(sa.String, nullable=True),
        "fwd_from_author_name": sa.Column(sa.String, nullable=True),
        "inserted": sa.Column(TIMESTAMP(timezone=True), server_default=sa.func.now()),
        "flow_id": sa.Column(sa.String),
        "country_id": sa.Column(sa.Integer, nullable=True),

    }
    x = type(modelname, (MyBase,), attributes)
    return x

TgMessageCountry = {}

for code in config.FEWS_COUNTRIES:
    TgMessageCountry[code] = TgMessageModelCreator(code)



