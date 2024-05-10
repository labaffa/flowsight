from fews2board.db.models import MyBase
import sqlalchemy as sa


class Topic(MyBase):
    __tablename__ = "topic"
    __table_args__ = (
        sa.UniqueConstraint("topic", name="id_topic"),
    )

    id = sa.Column(
        sa.Integer, primary_key=True, autoincrement=False, nullable=False
    )
    topic = sa.Column(sa.String(100))
    theme = sa.Column(sa.String(100))
    sub_theme = sa.Column(sa.String(100))
    domain_id = sa.Column(sa.Integer)


class Date(MyBase):
    __tablename__ = "date"
    __table_args__  = (sa.Index("date_date_actual_idx", "date_actual"),)

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=False, nullable=False)
    date_actual = sa.Column(sa.Date, nullable=False)
    epoch = sa.Column(sa.BigInteger, nullable=False)
    day_suffix = sa.Column(sa.String(4), nullable=False)
    day_name = sa.Column(sa.String(9), nullable=False)
    day_of_week = sa.Column(sa.Integer, nullable=False)
    day_of_month = sa.Column(sa.Integer, nullable=False)
    day_of_quarter = sa.Column(sa.Integer, nullable=False)
    day_of_year = sa.Column(sa.Integer, nullable=False)
    week_of_month = sa.Column(sa.Integer, nullable=False)
    week_of_year = sa.Column(sa.Integer, nullable=False)
    week_of_year_iso = sa.Column(sa.CHAR(10), nullable=False)
    month_actual = sa.Column(sa.Integer, nullable=False)
    month_name = sa.Column(sa.String(9), nullable=False)
    mont_name_abbreviated = sa.Column(sa.CHAR(3), nullable=False)
    quarter_actual = sa.Column(sa.Integer, nullable=False)
    quarter_name = sa.Column(sa.String(9), nullable=False)
    year_actual = sa.Column(sa.Integer, nullable=False)
    first_day_of_week = sa.Column(sa.Date, nullable=False)
    last_day_of_week = sa.Column(sa.Date, nullable=False)
    first_day_of_month = sa.Column(sa.Date, nullable=False)
    last_day_of_month = sa.Column(sa.Date, nullable=False)
    first_day_of_quarter = sa.Column(sa.Date, nullable=False)
    last_day_of_quarter = sa.Column(sa.Date, nullable=False)
    first_day_of_year = sa.Column(sa.Date, nullable=False)
    last_day_of_year = sa.Column(sa.Date, nullable=False)
    mmyyyy = sa.Column(sa.CHAR(6), nullable=False)
    mmddyyyy = sa.Column(sa.CHAR(10), nullable=False)
    weekend_indr = sa.Column(sa.Boolean, nullable=False)


class Country(MyBase):
    __tablename__ = "country"

    country_code = sa.Column(
        sa.Integer, primary_key=True, autoincrement=False, nullable=False)
    name = sa.Column(sa.String, nullable=False)
    alpha_2 = sa.Column(sa.CHAR(2), nullable=False)
    alpha_3 = sa.Column(sa.CHAR(3), nullable=False)
    region = sa.Column(sa.String, nullable=True)
    sub_region = sa.Column(sa.String, nullable=True)
    intermediate_region = sa.Column(sa.String, nullable=True)
    region_code = sa.Column(sa.Integer, nullable=True)
    sub_region_code = sa.Column(sa.Integer, nullable=True)
    intermediate_region_code = sa.Column(sa.Integer, nullable=True)


class Domain(MyBase):
    __tablename__ = "domain"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=False, nullable=False)
    name = sa.Column(sa.String, nullable=False)





