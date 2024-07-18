from fews2board.db.models import MyBase
import sqlalchemy as sa
from fews2board import config


class TopicIdDayAggTg(MyBase):
    __tablename__ = "topic_id_day_agg_tg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_norm_prevalence = sa.Column(sa.Float)


class TopicIdDayDomainAggTg(MyBase):
    __tablename__ = "topic_id_day_domain_agg_tg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_norm_prevalence = sa.Column(sa.Float)


class TgSentimentDayAgg(MyBase):
    __tablename__ = "tg_sentiment_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    sentiment = sa.Column(sa.Float)


class TgSentimentDayDomainAgg(MyBase):
    __tablename__ = "tg_sentiment_day_domain_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    sentiment = sa.Column(sa.Float)


class MCTopicIdDayAgg(MyBase):
    __tablename__ = "mc_topic_id_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_norm_prevalence = sa.Column(sa.Float)


class MCTopicIdDayDomainAgg(MyBase):
    __tablename__ = "mc_topic_id_day_domain_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_norm_prevalence = sa.Column(sa.Float)


class MCSentimentDayAgg(MyBase):
    __tablename__ = "mc_sentiment_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    sentiment = sa.Column(sa.Float)


class MCSentimentDayDomainAgg(MyBase):
    __tablename__ = "mc_sentiment_day_domain_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    sentiment = sa.Column(sa.Float)


class TgTopicIdCountDayAgg(MyBase):
    __tablename__ = "tg_topic_id_count_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    msg_count = sa.Column(sa.Integer)
    topic_count = sa.Column(sa.Integer)


class TgTopicIdCountDayDomainAgg(MyBase):
    __tablename__ = "tg_topic_id_count_day_domain_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    msg_count = sa.Column(sa.Integer)
    topic_count = sa.Column(sa.Integer)


class TgLatestUpdates(MyBase):
    __tablename__ = "tg_latest_updates"

    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    date_id = sa.Column(sa.Integer, nullable=True)


class MCLatestUpdates(MyBase):
    __tablename__ = "mc_latest_updates"

    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    date_id = sa.Column(sa.Integer, nullable=True)


class MCTopicIdCountDayAgg(MyBase):
    __tablename__ = "mc_topic_id_count_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    topic_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    story_count = sa.Column(sa.Integer)
    topic_count = sa.Column(sa.Integer)


class MCTopicIdCountDayDomainAgg(MyBase):
    __tablename__ = "mc_topic_id_count_day_domain_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    story_count = sa.Column(sa.Integer)
    topic_count = sa.Column(sa.Integer)


class DateRanges(MyBase):
    __tablename__ = "date_ranges"

    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    stream = sa.Column(sa.CHAR(2), primary_key=True, nullable=True)
    min_date_id = sa.Column(sa.Integer, nullable=True)
    max_date_id = sa.Column(sa.Integer, nullable=True)


class MCPersonsDayAgg(MyBase):
    __tablename__ = "mc_persons_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    person_name = sa.Column(sa.String, primary_key=True, nullable=False)
    persons_count = sa.Column(sa.Integer)
    person_percent = sa.Column(sa.Float)


class MCLocationsDayAgg(MyBase):
    __tablename__ = "mc_locations_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    location_name = sa.Column(sa.String, primary_key=True, nullable=False)
    locations_count = sa.Column(sa.Integer)
    location_percent = sa.Column(sa.Float)


class MCOrgsDayAgg(MyBase):
    __tablename__ = "mc_orgs_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    org_name = sa.Column(sa.String, primary_key=True, nullable=False)
    orgs_count = sa.Column(sa.Integer)
    org_percent = sa.Column(sa.Float)


class MCBigramsDayAgg(MyBase):
    __tablename__ = "mc_bigrams_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    bigram = sa.Column(sa.String, primary_key=True, nullable=False)
    bigrams_count = sa.Column(sa.Integer)
    bigram_percent = sa.Column(sa.Float)


class MCTrigramsDayAgg(MyBase):
    __tablename__ = "mc_trigrams_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    trigram = sa.Column(sa.String, primary_key=True, nullable=False)
    trigrams_count = sa.Column(sa.Integer)
    trigram_percent = sa.Column(sa.Float)


class SSIDayAgg(MyBase):
    __tablename__ = "ssi_day_agg"

    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    ssi_domain_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    ssi_field_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    value = sa.Column(sa.Float, nullable=True)
    is_ssi_w = sa.Column(sa.Boolean, nullable=False)


class MCDailyCounts(MyBase):
    __tablename__ = "mc_daily_counts"

    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    count = sa.Column(sa.Integer)


class TgDailyCounts(MyBase):
    __tablename__ = "tg_daily_counts"

    country_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    date_id = sa.Column(sa.Integer, primary_key=True, nullable=False)
    count = sa.Column(sa.Integer)


def TFIDFModelCreator(alpha2):
    tablename = f'tfidf_{alpha2.lower()}'
    modelname = tablename.upper()
    attributes = {
        "__tablename__": tablename,
        "__table_args__": (
            sa.Index(f"{tablename}_date_id", "date_id"),
            sa.Index(f"{tablename}_message_unique_id", "message_unique_id")
        ),
        "message_unique_id": sa.Column(sa.Integer, primary_key=True, nullable=False),
        "lemma": sa.Column(sa.String, primary_key=True, nullable=False),
        "date_id":  sa.Column(sa.Integer, nullable=False),
        "tfidf": sa.Column(sa.Float)

    }
    x = type(modelname, (MyBase,), attributes)
    return x


TFIDF = {}
for a2 in config.FEWS_COUNTRIES:
    TFIDF[a2] = TFIDFModelCreator(a2)


def TFIDFDayAggModelCreator(alpha2):
    tablename = f'tfidf_day_agg_{alpha2.lower()}'
    modelname = tablename.upper()
    attributes = {
        "__tablename__": tablename,
        "__table_args__": (
            sa.Index(f"{tablename}_date_id", "date_id"),
        ),
        "date_id":  sa.Column(sa.Integer, nullable=False),
        "lemma": sa.Column(sa.String, primary_key=True, nullable=False),
        "tfidf": sa.Column(sa.Float)

    }
    x = type(modelname, (MyBase,), attributes)
    return x

TFIDFDayAgg = {}
for a2 in config.FEWS_COUNTRIES:
    TFIDFDayAgg[a2] = TFIDFDayAggModelCreator(a2)
