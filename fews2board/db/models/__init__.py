from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import MetaData
from fews2board import config


Base = declarative_base(metadata=MetaData(schema=config.PG_SCHEMA_NAME))


class MyBase(Base):
    __abstract__ = True

    def to_dict(self):
        return {field.name:getattr(self, field.name) for field in self.__table__.c}


from fews2board.db.models.telegram import TgMessage, TgChannel, TgSentiment, TgTopicId, \
    TgTopicIdPositive, TgMessageCountry
from fews2board.db.models.luigi import MarkerTable
from fews2board.db.models.media_monitoring import MCStory, MCSentiment, MCTopicId, \
    MCTopicIdPositive
from fews2board.db.models.framework import Topic, Date, Country, Domain, SSIDomain, \
    SSIField
from fews2board.db.models.facts import TopicIdDayAggTg, TopicIdDayDomainAggTg, \
    TgSentimentDayAgg, TgSentimentDayDomainAgg, MCSentimentDayAgg, MCSentimentDayDomainAgg, \
    MCTopicIdDayAgg, MCTopicIdDayDomainAgg, TgTopicIdCountDayAgg, \
    TgTopicIdCountDayDomainAgg, TgLatestUpdates, MCLatestUpdates, \
    MCTopicIdCountDayAgg, MCTopicIdCountDayDomainAgg, DateRanges, MCBigramsDayAgg, \
    MCLocationsDayAgg, MCOrgsDayAgg, MCPersonsDayAgg, MCTrigramsDayAgg, SSIDayAgg, MCDailyCounts, \
    TgDailyCounts, TFIDF
