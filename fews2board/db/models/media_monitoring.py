from fews2board.db.models import MyBase
import sqlalchemy as sa


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


class MCSentiment(MyBase):
    __tablename__ = "mc_sentiment"

    story_id = sa.Column(sa.String, primary_key=True, autoincrement=False)
    sentiment = sa.Column(sa.Float)


class MCTopicId(MyBase):
    __tablename__ = "mc_topic_id"

    story_id = sa.Column(sa.String, primary_key=True)
    topic_unique_id = sa.Column(sa.Integer, primary_key=True)
    topic_norm_prevalence = sa.Column(sa.Float)