from fews2board.db.models import MyBase
import sqlalchemy as sa


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
