import datetime as dt
import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from psycopg.rows import dict_row

from flowsight import config as app_config
from flowsight.db import models
from flowsight.db.utils import tablename
from flowsight.api.utils import generate_filter_clauses, topic_output_clause


@dataclass(frozen=True)
class HumanMobilityStreamModels:
    hm_model: object
    topic_model: object
    sentiment_model: object
    anomaly_model: object
    record_id_col: str


def stream_models(stream: str, alpha_2: str) -> HumanMobilityStreamModels:
    alpha_2 = alpha_2.strip().lower()
    if stream == "tg":
        return HumanMobilityStreamModels(
            hm_model=models.TgHumanMobilityMessageCountry[alpha_2],
            topic_model=models.TgTopicIdPositive,
            sentiment_model=models.TgSentiment,
            anomaly_model=models.TgHumanMobilityTopicIdDayAgg,
            record_id_col="message_unique_id",
        )
    if stream == "mc":
        return HumanMobilityStreamModels(
            hm_model=models.MCHumanMobilityStoryCountry[alpha_2],
            topic_model=models.MCTopicIdPositive,
            sentiment_model=models.MCSentiment,
            anomaly_model=models.MCHumanMobilityTopicIdDayAgg,
            record_id_col="story_id",
        )
    raise ValueError(f"Stream {stream} not allowed")


def _previous_period(start_date: int, end_date: int) -> tuple[int, int]:
    date1 = dt.datetime.strptime(str(start_date), "%Y%m%d")
    date2 = dt.datetime.strptime(str(end_date), "%Y%m%d")
    day_difference = (date2 - date1).days + 1
    prev_start_date = int((date1 - dt.timedelta(days=day_difference)).strftime("%Y%m%d"))
    prev_end_date = int((date1 - dt.timedelta(days=1)).strftime("%Y%m%d"))
    return prev_start_date, prev_end_date


def _topic_filter_clause(conditions, table_alias: str = "agg", topic_col: str = "topic_id") -> str:
    if not conditions:
        return ""
    topic_values = [
        cond["value"]
        for cond in conditions
        if cond.get("field") == "Topic" and cond.get("operator") == "IS"
    ]
    if not topic_values:
        return ""
    return f" AND {table_alias}.{topic_col} IN ({', '.join(str(v) for v in topic_values)})"


def _normalize_source_domain(value: str | None) -> str | None:
    raw = (value or "").strip().lower()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"http://{raw}"
    host = urlparse(raw).hostname or ""
    host = host.strip(".")
    if host.startswith("www."):
        host = host[4:]
    return host or None


@lru_cache(maxsize=None)
def _configured_mediacloud_domains(alpha_2: str) -> tuple[str, ...]:
    dataset_path = (
        Path(app_config.SOURCE_FOLDER)
        / "db"
        / "datasets"
        / "mediacloud"
        / f"{alpha_2.strip().lower()}.tsv"
    )
    if not dataset_path.exists():
        return tuple()
    domains = []
    with dataset_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            domain = _normalize_source_domain(row.get("domain") or row.get("homepage"))
            if domain:
                domains.append(domain)
    return tuple(sorted(set(domains)))


async def corpus_summary(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)

    if stream == "tg":
        raw_table = tablename(models.TgMessageCountry[alpha_2])
        raw_record_id_col = "unique_id"
        raw_date_clause = (
            f"raw.timestamp::date BETWEEN to_date('{start_date}', 'YYYYMMDD') "
            f"AND to_date('{end_date}', 'YYYYMMDD')"
        )
    elif stream == "mc":
        raw_table = tablename(models.MCStoryCountry[alpha_2])
        raw_record_id_col = "id"
        raw_date_clause = (
            f"raw.publish_date::date BETWEEN to_date('{start_date}', 'YYYYMMDD') "
            f"AND to_date('{end_date}', 'YYYYMMDD')"
        )
    else:
        raise ValueError(f"Stream {stream} not allowed")

    if conditions:
        matching_records = f"""
            SELECT DISTINCT hm.{record_id_col}
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        """
    else:
        matching_records = f"""
            SELECT hm.{record_id_col}
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
        """

    q = f"""
        WITH matching_records AS (
            {matching_records}
        )
        SELECT
            (SELECT count(DISTINCT raw.{raw_record_id_col})
             FROM {raw_table} raw
             WHERE raw.country_id = {country_id}) AS all_records_total,
            (SELECT count(DISTINCT raw.{raw_record_id_col})
             FROM {raw_table} raw
             WHERE raw.country_id = {country_id}
               AND {raw_date_clause}) AS all_records_in_period,
            (SELECT count(DISTINCT hm.{record_id_col})
             FROM {hm_table} hm
             WHERE hm.country_id = {country_id}) AS hm_records_total,
            (SELECT count(DISTINCT hm.{record_id_col})
             FROM {hm_table} hm
             WHERE hm.country_id = {country_id}
               AND hm.date_id BETWEEN {start_date} AND {end_date}) AS hm_records_in_period,
            (SELECT count(*) FROM matching_records) AS filtered_hm_records_in_period;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchone()


async def social_listening_summary(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models("tg", alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    message_table = tablename(models.TgMessageCountry[alpha_2])
    raw_message_table = tablename(models.TgMessageCountry[alpha_2])
    channel_table = tablename(models.TgChannel)
    schema_name = models.Topic.__table__.schema
    channel_config_table = f"{schema_name}.tg_channel_config"
    channel_alias_table = f"{schema_name}.tg_channel_username_alias"
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    prev_start_date, prev_end_date = _previous_period(start_date, end_date)

    def matched_records_sql(range_start: int, range_end: int) -> str:
        return f"""
            SELECT DISTINCT hm.{record_id_col} AS record_id, hm.country_id, hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {range_start} AND {range_end}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        """

    q = f"""
        WITH current_matches AS (
            {matched_records_sql(start_date, end_date)}
        ),
        previous_matches AS (
            {matched_records_sql(prev_start_date, prev_end_date)}
        ),
        configured_resolved_channels AS (
            SELECT DISTINCT
                cfg.username AS configured_username,
                ch.channel_id
            FROM {channel_config_table} cfg
            JOIN {channel_alias_table} alias
              ON lower(alias.username) = lower(cfg.username)
             AND alias.channel_id IS NOT NULL
             AND alias.resolution_status = 'resolved'
            JOIN {channel_table} ch
              ON ch.channel_id = alias.channel_id
            WHERE cfg.country_id = {country_id}
        ),
        current_base AS (
            SELECT
                count(DISTINCT cm.record_id) AS hm_messages,
                count(DISTINCT ms.channel_id) FILTER (WHERE crc.channel_id IS NOT NULL) AS active_channels,
                avg(ts.sentiment) AS average_sentiment
            FROM current_matches cm
            JOIN {message_table} ms
              ON ms.unique_id = cm.record_id
             AND ms.country_id = cm.country_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = cm.record_id
             AND ts.country_id = cm.country_id
            LEFT JOIN configured_resolved_channels crc
              ON crc.channel_id = ms.channel_id
        ),
        previous_base AS (
            SELECT
                count(DISTINCT pm.record_id) AS hm_messages,
                count(DISTINCT ms.channel_id) FILTER (WHERE crc.channel_id IS NOT NULL) AS active_channels,
                avg(ts.sentiment) AS average_sentiment
            FROM previous_matches pm
            JOIN {message_table} ms
              ON ms.unique_id = pm.record_id
             AND ms.country_id = pm.country_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = pm.record_id
             AND ts.country_id = pm.country_id
            LEFT JOIN configured_resolved_channels crc
              ON crc.channel_id = ms.channel_id
        ),
        current_totals AS (
            SELECT
                count(DISTINCT raw.unique_id) AS total_messages,
                (SELECT count(DISTINCT configured_username) FROM configured_resolved_channels) AS total_channels
            FROM {raw_message_table} raw
            WHERE raw.country_id = {country_id}
              AND raw.timestamp::date BETWEEN to_date('{start_date}', 'YYYYMMDD')
                  AND to_date('{end_date}', 'YYYYMMDD')
        ),
        current_topics AS (
            SELECT
                count(DISTINCT i.id) AS active_indicators,
                count(DISTINCT t.id) AS active_topics
            FROM current_matches cm
            JOIN {topic_table} all_ttip
              ON all_ttip.{record_id_col} = cm.record_id
             AND all_ttip.country_id = cm.country_id
             AND all_ttip.date_id = cm.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = all_ttip.topic_unique_id
            JOIN {models.Topic.__table__.schema}.indicator i
              ON i.id = t.indicator_id
            JOIN {tablename(models.Domain)} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
        )
        SELECT
            cb.hm_messages,
            pb.hm_messages AS previous_hm_messages,
            ctot.total_messages,
            cb.active_channels,
            pb.active_channels AS previous_active_channels,
            ctot.total_channels,
            cb.average_sentiment,
            pb.average_sentiment AS previous_average_sentiment,
            ct.active_indicators,
            ct.active_topics
        FROM current_base cb
        CROSS JOIN previous_base pb
        CROSS JOIN current_totals ctot
        CROSS JOIN current_topics ct;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return dict(await cur.fetchone() or {})


async def media_monitoring_summary(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models("mc", alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    story_table = tablename(models.MCStoryCountry[alpha_2])
    raw_story_table = tablename(models.MCStoryCountry[alpha_2])
    schema_name = models.Topic.__table__.schema
    indicator_table = f"{schema_name}.indicator"
    domain_table = tablename(models.Domain)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    prev_start_date, prev_end_date = _previous_period(start_date, end_date)
    domain_expr = (
        "lower(regexp_replace("
        "coalesce("
        "nullif(substring(coalesce(ms.media_url, '') from '^(?:https?://)?(?:www\\.)?([^/:?#]+)'), ''), "
        "nullif(substring(coalesce(ms.media_name, '') from '^(?:https?://)?(?:www\\.)?([^/:?#]+)'), '')"
        "), "
        "'\\.$', ''"
        "))"
    )

    def matched_records_sql(range_start: int, range_end: int) -> str:
        return f"""
            SELECT DISTINCT hm.{record_id_col} AS record_id, hm.country_id, hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {range_start} AND {range_end}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        """

    q = f"""
        WITH current_matches AS (
            {matched_records_sql(start_date, end_date)}
        ),
        previous_matches AS (
            {matched_records_sql(prev_start_date, prev_end_date)}
        ),
        current_base AS (
            SELECT
                count(DISTINCT cm.record_id) AS hm_stories,
                avg(ts.sentiment) AS average_sentiment,
                coalesce(
                    array_agg(DISTINCT {domain_expr}) FILTER (WHERE {domain_expr} IS NOT NULL),
                    ARRAY[]::text[]
                ) AS source_domains
            FROM current_matches cm
            JOIN {story_table} ms
              ON ms.id = cm.record_id
             AND ms.country_id = cm.country_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = cm.record_id
             AND ts.country_id = cm.country_id
        ),
        previous_base AS (
            SELECT
                count(DISTINCT pm.record_id) AS hm_stories,
                avg(ts.sentiment) AS average_sentiment,
                coalesce(
                    array_agg(DISTINCT {domain_expr}) FILTER (WHERE {domain_expr} IS NOT NULL),
                    ARRAY[]::text[]
                ) AS source_domains
            FROM previous_matches pm
            JOIN {story_table} ms
              ON ms.id = pm.record_id
             AND ms.country_id = pm.country_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = pm.record_id
             AND ts.country_id = pm.country_id
        ),
        current_totals AS (
            SELECT count(DISTINCT raw.id) AS total_stories
            FROM {raw_story_table} raw
            WHERE raw.country_id = {country_id}
              AND raw.publish_date::date BETWEEN to_date('{start_date}', 'YYYYMMDD')
                  AND to_date('{end_date}', 'YYYYMMDD')
        ),
        current_topics AS (
            SELECT
                count(DISTINCT i.id) AS active_indicators,
                count(DISTINCT t.id) AS active_topics
            FROM current_matches cm
            JOIN {topic_table} all_ttip
              ON all_ttip.{record_id_col} = cm.record_id
             AND all_ttip.country_id = cm.country_id
             AND all_ttip.date_id = cm.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = all_ttip.topic_unique_id
            JOIN {indicator_table} i
              ON i.id = t.indicator_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
        )
        SELECT
            cb.hm_stories,
            pb.hm_stories AS previous_hm_stories,
            ctot.total_stories,
            cb.average_sentiment,
            pb.average_sentiment AS previous_average_sentiment,
            cb.source_domains AS current_source_domains,
            pb.source_domains AS previous_source_domains,
            ct.active_indicators,
            ct.active_topics
        FROM current_base cb
        CROSS JOIN previous_base pb
        CROSS JOIN current_totals ctot
        CROSS JOIN current_topics ct;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = dict(await cur.fetchone() or {})

    configured_domains = set(_configured_mediacloud_domains(alpha_2))
    current_domains = set()
    for domain in result.get("current_source_domains") or []:
        normalized = _normalize_source_domain(domain)
        if normalized:
            current_domains.add(normalized)
    previous_domains = set()
    for domain in result.get("previous_source_domains") or []:
        normalized = _normalize_source_domain(domain)
        if normalized:
            previous_domains.add(normalized)
    result["total_sources"] = len(configured_domains)
    result["active_sources"] = (
        len(current_domains & configured_domains) if configured_domains else len(current_domains)
    )
    result["previous_active_sources"] = (
        len(previous_domains & configured_domains) if configured_domains else len(previous_domains)
    )
    result.pop("current_source_domains", None)
    result.pop("previous_source_domains", None)
    return result


def _resolve_coverage_interval(start_date: int, end_date: int, interval: str) -> str:
    allowed_intervals = {"auto", "day", "week", "month"}
    if interval not in allowed_intervals:
        raise ValueError(
            f"Interval {interval} not allowed. Use one of: {', '.join(sorted(allowed_intervals))}."
        )
    date1 = dt.datetime.strptime(str(start_date), "%Y%m%d")
    date2 = dt.datetime.strptime(str(end_date), "%Y%m%d")
    if date2 < date1:
        raise ValueError("end_date must not be earlier than start_date.")
    if interval != "auto":
        return interval
    selected_days = (date2 - date1).days + 1
    if selected_days <= 60:
        return "day"
    if selected_days <= 365:
        return "week"
    return "month"


async def corpus_coverage_series(
    pool,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    interval: str = "auto",
    conditions=None,
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    hm_record_id_col = stream_ctx.record_id_col
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)
    previous_start_date, previous_end_date = _previous_period(start_date, end_date)
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)

    if stream == "tg":
        raw_table = tablename(models.TgMessageCountry[alpha_2])
        raw_record_id_col = "unique_id"
        raw_date_col = "timestamp"
    elif stream == "mc":
        raw_table = tablename(models.MCStoryCountry[alpha_2])
        raw_record_id_col = "id"
        raw_date_col = "publish_date"
    else:
        raise ValueError(f"Stream {stream} not allowed")

    if conditions:
        matching_records_q = f"""
        matching_records AS (
            SELECT DISTINCT
                hm.{hm_record_id_col} AS record_id,
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{hm_record_id_col} = hm.{hm_record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{hm_record_id_col} = hm.{hm_record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        ),
        previous_matching_records AS (
            SELECT DISTINCT
                hm.{hm_record_id_col} AS record_id,
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{hm_record_id_col} = hm.{hm_record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{hm_record_id_col} = hm.{hm_record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {previous_start_date} AND {previous_end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        ),
        """
        hm_counts_source = f"""
        matching_records mr
        JOIN {tablename(models.Date)} d
          ON d.id = mr.date_id
        """
        hm_count_select = "count(DISTINCT mr.record_id) AS hm_records"
        hm_count_group = "GROUP BY 1"
        hm_summary_current = "(SELECT count(*) FROM matching_records) AS hm_records,"
        hm_summary_previous = "(SELECT count(*) FROM previous_matching_records) AS previous_hm_records"
    else:
        matching_records_q = ""
        hm_counts_source = f"{hm_table} hm"
        hm_count_select = f"count(DISTINCT hm.{hm_record_id_col}) AS hm_records"
        hm_count_group = "GROUP BY 1"
        hm_summary_current = f"""(SELECT count(DISTINCT hm.{hm_record_id_col})
             FROM {hm_table} hm
             WHERE hm.country_id = {country_id}
               AND hm.date_id BETWEEN {start_date} AND {end_date}) AS hm_records,"""
        hm_summary_previous = f"""(SELECT count(DISTINCT hm.{hm_record_id_col})
             FROM {hm_table} hm
             WHERE hm.country_id = {country_id}
               AND hm.date_id BETWEEN {previous_start_date} AND {previous_end_date}) AS previous_hm_records"""

    series_q = f"""
        WITH {matching_records_q}
        buckets AS (
            SELECT generate_series(
                date_trunc('{resolved_interval}', to_date('{start_date}', 'YYYYMMDD'))::date,
                date_trunc('{resolved_interval}', to_date('{end_date}', 'YYYYMMDD'))::date,
                interval '1 {resolved_interval}'
            )::date AS period_start
        ),
        all_counts AS (
            SELECT
                date_trunc('{resolved_interval}', raw.{raw_date_col})::date AS period_start,
                count(DISTINCT raw.{raw_record_id_col}) AS all_records
            FROM {raw_table} raw
            WHERE raw.country_id = {country_id}
              AND raw.{raw_date_col}::date BETWEEN to_date('{start_date}', 'YYYYMMDD')
                                               AND to_date('{end_date}', 'YYYYMMDD')
            GROUP BY 1
        ),
        hm_counts AS (
            SELECT
                date_trunc('{resolved_interval}', {('d.date_actual' if conditions else "to_date(hm.date_id::text, 'YYYYMMDD')")})::date AS period_start,
                {hm_count_select}
            FROM {hm_counts_source}
            {'' if conditions else f"WHERE hm.country_id = {country_id} AND hm.date_id BETWEEN {start_date} AND {end_date}"}
            {hm_count_group}
        )
        SELECT
            extract(epoch FROM b.period_start)::bigint * 1000 AS date,
            b.period_start::text AS period,
            coalesce(ac.all_records, 0) AS all_records,
            coalesce(hc.hm_records, 0) AS hm_records,
            CASE
                WHEN coalesce(ac.all_records, 0) = 0 THEN NULL
                ELSE coalesce(hc.hm_records, 0)::float / ac.all_records
            END AS hm_coverage
        FROM buckets b
        LEFT JOIN all_counts ac USING (period_start)
        LEFT JOIN hm_counts hc USING (period_start)
        ORDER BY b.period_start;
    """
    summary_ctes = matching_records_q.rstrip().rstrip(",") if conditions else ""
    summary_prefix = f"WITH {summary_ctes}" if conditions else ""
    summary_q = f"""
        {summary_prefix}
        SELECT
            (SELECT count(DISTINCT raw.{raw_record_id_col})
             FROM {raw_table} raw
             WHERE raw.country_id = {country_id}
               AND raw.{raw_date_col}::date BETWEEN to_date('{start_date}', 'YYYYMMDD')
                                                AND to_date('{end_date}', 'YYYYMMDD')) AS all_records,
            {hm_summary_current}
            (SELECT count(DISTINCT raw.{raw_record_id_col})
             FROM {raw_table} raw
             WHERE raw.country_id = {country_id}
               AND raw.{raw_date_col}::date BETWEEN to_date('{previous_start_date}', 'YYYYMMDD')
                                                AND to_date('{previous_end_date}', 'YYYYMMDD')) AS previous_all_records,
            {hm_summary_previous};
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(series_q)
            data = await cur.fetchall()
            await cur.execute(summary_q)
            summary = await cur.fetchone()

    coverage = (
        summary["hm_records"] / summary["all_records"]
        if summary["all_records"]
        else None
    )
    previous_coverage = (
        summary["previous_hm_records"] / summary["previous_all_records"]
        if summary["previous_all_records"]
        else None
    )
    coverage_change_pp = (
        (coverage - previous_coverage) * 100
        if coverage is not None and previous_coverage is not None
        else None
    )
    summary["hm_coverage"] = coverage
    summary["previous_hm_coverage"] = previous_coverage
    summary["hm_coverage_change_pp"] = coverage_change_pp
    return {
        "stream": stream,
        "interval": resolved_interval,
        "requested_interval": interval,
        "period": {"start_date": start_date, "end_date": end_date},
        "previous_period": {
            "start_date": previous_start_date,
            "end_date": previous_end_date,
        },
        "filtered": bool(conditions),
        "summary": summary,
        "data": data,
    }


async def attention_trends(
    pool,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    record_id_col = stream_ctx.record_id_col

    q = f"""
        WITH hm_daily_count AS (
            SELECT
                hm.country_id,
                hm.date_id,
                count(*) AS hm_count
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY hm.country_id, hm.date_id
        )
        SELECT
            d.date_actual AS date,
            dom.name AS domain,
            count(DISTINCT hm.{record_id_col})::float / nullif(hdc.hm_count, 0) AS value
        FROM {hm_table} hm
        JOIN {topic_table} ttip
          ON ttip.{record_id_col} = hm.{record_id_col}
         AND ttip.country_id = hm.country_id
         AND ttip.date_id = hm.date_id
        JOIN hm_daily_count hdc
          ON hdc.country_id = hm.country_id
         AND hdc.date_id = hm.date_id
        JOIN {tablename(models.Date)} d
          ON d.id = hm.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = ttip.topic_unique_id
        JOIN {tablename(models.Domain)} dom
          ON dom.id = t.domain_id
        WHERE hm.country_id = {country_id}
          AND hm.date_id BETWEEN {start_date} AND {end_date}
        GROUP BY d.date_actual, dom.name, hdc.hm_count
        ORDER BY d.date_actual, dom.name;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def hm_indicator_attention_trends(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    interval: str = "auto",
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    output_topic_clause = topic_output_clause(conditions, "strict", "src")
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)
    indicator_table = f"{models.Topic.__table__.schema}.indicator"
    domain_table = tablename(models.Domain)
    date_table = tablename(models.Date)

    if conditions:
        qualified_records_q = f"""
            SELECT DISTINCT
                hm.{record_id_col} AS record_id,
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        """
        indicator_scope_q = f"""
            SELECT DISTINCT
                i.id AS indicator_id,
                i.name AS indicator_name
            FROM qualified_records qr
            JOIN {topic_table} src
              ON src.{record_id_col} = qr.record_id
             AND src.country_id = qr.country_id
             AND src.date_id = qr.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = src.topic_unique_id
            JOIN {indicator_table} i
              ON i.id = t.indicator_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
              AND t.indicator_id IS NOT NULL
              {output_topic_clause}
        """
    else:
        qualified_records_q = f"""
            SELECT
                hm.{record_id_col} AS record_id,
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
        """
        indicator_scope_q = f"""
            SELECT
                i.id AS indicator_id,
                i.name AS indicator_name
            FROM {indicator_table} i
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
        """

    q = f"""
        WITH qualified_records AS (
            {qualified_records_q}
        ),
        indicator_scope AS (
            {indicator_scope_q}
        ),
        buckets AS (
            SELECT generate_series(
                date_trunc('{resolved_interval}', to_date('{start_date}', 'YYYYMMDD'))::date,
                date_trunc('{resolved_interval}', to_date('{end_date}', 'YYYYMMDD'))::date,
                interval '1 {resolved_interval}'
            )::date AS period_start
        ),
        hm_bucket_counts AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                count(DISTINCT hm.{record_id_col}) AS hm_count
            FROM {hm_table} hm
            JOIN {date_table} d
              ON d.id = hm.date_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY 1
        ),
        indicator_matches AS (
            SELECT DISTINCT
                qr.record_id,
                qr.country_id,
                qr.date_id,
                i.id AS indicator_id,
                i.name AS indicator_name
            FROM qualified_records qr
            JOIN {topic_table} src
              ON src.{record_id_col} = qr.record_id
             AND src.country_id = qr.country_id
             AND src.date_id = qr.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = src.topic_unique_id
            JOIN {indicator_table} i
              ON i.id = t.indicator_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
              AND t.indicator_id IS NOT NULL
              {output_topic_clause}
        ),
        aggregated AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                im.indicator_id,
                im.indicator_name,
                count(DISTINCT im.record_id)::float / nullif(hbc.hm_count, 0) AS value
            FROM indicator_matches im
            JOIN {date_table} d
              ON d.id = im.date_id
            JOIN hm_bucket_counts hbc
              ON hbc.period_start = date_trunc('{resolved_interval}', d.date_actual)::date
            GROUP BY 1, im.indicator_id, im.indicator_name, hbc.hm_count
        )
        SELECT
            extract(epoch FROM b.period_start)::bigint * 1000 AS date,
            b.period_start::text AS period,
            s.indicator_id,
            s.indicator_name,
            CASE
                WHEN hbc.hm_count IS NULL OR hbc.hm_count = 0 THEN NULL
                ELSE coalesce(a.value, 0)
            END AS value
        FROM buckets b
        CROSS JOIN indicator_scope s
        LEFT JOIN hm_bucket_counts hbc
          ON hbc.period_start = b.period_start
        LEFT JOIN aggregated a
          ON a.period_start = b.period_start
         AND a.indicator_id = s.indicator_id
        ORDER BY b.period_start, s.indicator_name;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return {
                "stream": stream,
                "interval": resolved_interval,
                "requested_interval": interval,
                "period": {"start_date": start_date, "end_date": end_date},
                "data": await cur.fetchall(),
            }


async def hm_topic_attention_trends(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    interval: str = "auto",
    topic_filter_mode: str = "strict",
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    output_topic_clause = topic_output_clause(conditions, topic_filter_mode, "src")
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)
    date_table = tablename(models.Date)
    topic_meta_table = tablename(models.Topic)

    if not topic_clause:
        return {
            "stream": stream,
            "interval": resolved_interval,
            "requested_interval": interval,
            "period": {"start_date": start_date, "end_date": end_date},
            "data": [],
        }

    qualified_records_q = f"""
        SELECT DISTINCT
            hm.{record_id_col} AS record_id,
            hm.country_id,
            hm.date_id
        FROM {hm_table} hm
        JOIN {topic_table} ttip
          ON ttip.{record_id_col} = hm.{record_id_col}
         AND ttip.country_id = hm.country_id
         AND ttip.date_id = hm.date_id
        JOIN {sentiment_table} ts
          ON ts.{record_id_col} = hm.{record_id_col}
         AND ts.country_id = hm.country_id
        WHERE hm.country_id = {country_id}
          AND hm.date_id BETWEEN {start_date} AND {end_date}
          {topic_clause}
          {sentiment_clause}
          {emotion_clause}
    """
    topic_scope_q = f"""
        SELECT DISTINCT
            t.id AS topic_id,
            t.topic AS topic_name
        FROM qualified_records qr
        JOIN {topic_table} src
          ON src.{record_id_col} = qr.record_id
         AND src.country_id = qr.country_id
         AND src.date_id = qr.date_id
        JOIN {topic_meta_table} t
          ON t.id = src.topic_unique_id
        WHERE 1 = 1
          {output_topic_clause}
    """

    q = f"""
        WITH qualified_records AS (
            {qualified_records_q}
        ),
        topic_scope AS (
            {topic_scope_q}
        ),
        buckets AS (
            SELECT generate_series(
                date_trunc('{resolved_interval}', to_date('{start_date}', 'YYYYMMDD'))::date,
                date_trunc('{resolved_interval}', to_date('{end_date}', 'YYYYMMDD'))::date,
                interval '1 {resolved_interval}'
            )::date AS period_start
        ),
        hm_bucket_counts AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                count(DISTINCT hm.{record_id_col}) AS hm_count
            FROM {hm_table} hm
            JOIN {date_table} d
              ON d.id = hm.date_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY 1
        ),
        topic_matches AS (
            SELECT DISTINCT
                qr.record_id,
                qr.country_id,
                qr.date_id,
                t.id AS topic_id,
                t.topic AS topic_name
            FROM qualified_records qr
            JOIN {topic_table} src
              ON src.{record_id_col} = qr.record_id
             AND src.country_id = qr.country_id
             AND src.date_id = qr.date_id
            JOIN {topic_meta_table} t
              ON t.id = src.topic_unique_id
            WHERE 1 = 1
              {output_topic_clause}
        ),
        aggregated AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                tm.topic_id,
                tm.topic_name,
                count(DISTINCT tm.record_id)::float / nullif(hbc.hm_count, 0) AS value
            FROM topic_matches tm
            JOIN {date_table} d
              ON d.id = tm.date_id
            JOIN hm_bucket_counts hbc
              ON hbc.period_start = date_trunc('{resolved_interval}', d.date_actual)::date
            GROUP BY 1, tm.topic_id, tm.topic_name, hbc.hm_count
        )
        SELECT
            extract(epoch FROM b.period_start)::bigint * 1000 AS date,
            b.period_start::text AS period,
            s.topic_id,
            s.topic_name,
            CASE
                WHEN hbc.hm_count IS NULL OR hbc.hm_count = 0 THEN NULL
                ELSE coalesce(a.value, 0)
            END AS value
        FROM buckets b
        CROSS JOIN topic_scope s
        LEFT JOIN hm_bucket_counts hbc
          ON hbc.period_start = b.period_start
        LEFT JOIN aggregated a
          ON a.period_start = b.period_start
         AND a.topic_id = s.topic_id
        ORDER BY b.period_start, s.topic_name;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return {
                "stream": stream,
                "interval": resolved_interval,
                "requested_interval": interval,
                "period": {"start_date": start_date, "end_date": end_date},
                "data": await cur.fetchall(),
            }


async def domain_prevalences(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)

    q = f"""
        WITH hm_daily_count AS (
            SELECT
                hm.country_id,
                hm.date_id,
                count(*) AS hm_count
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY hm.country_id, hm.date_id
        ),
        qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            d.date_actual AS date,
            dom.name AS domain,
            count(DISTINCT qr.{record_id_col})::float / nullif(hdc.hm_count, 0) AS value
        FROM qualified_records qr
        JOIN {topic_table} all_ttip
          ON all_ttip.{record_id_col} = qr.{record_id_col}
         AND all_ttip.country_id = qr.country_id
         AND all_ttip.date_id = qr.date_id
        JOIN hm_daily_count hdc
          ON hdc.country_id = qr.country_id
         AND hdc.date_id = qr.date_id
        JOIN {tablename(models.Date)} d
          ON d.id = qr.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = all_ttip.topic_unique_id
        JOIN {tablename(models.Domain)} dom
          ON dom.id = t.domain_id
        GROUP BY d.date_actual, dom.name, hdc.hm_count
        ORDER BY d.date_actual, dom.name;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def topic_time_series(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    topic_filter_mode: str = "strict",
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    output_topic_clause = topic_output_clause(conditions, topic_filter_mode, "all_ttip")

    q = f"""
        WITH hm_daily_count AS (
            SELECT
                hm.country_id,
                hm.date_id,
                count(*) AS hm_count
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY hm.country_id, hm.date_id
        ),
        qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            qr.date_id AS date_id,
            count(DISTINCT qr.{record_id_col})::float / nullif(hdc.hm_count, 0) AS value,
            t.topic AS topic
        FROM qualified_records qr
        JOIN {topic_table} all_ttip
          ON all_ttip.{record_id_col} = qr.{record_id_col}
         AND all_ttip.country_id = qr.country_id
         AND all_ttip.date_id = qr.date_id
        JOIN hm_daily_count hdc
          ON hdc.country_id = qr.country_id
         AND hdc.date_id = qr.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = all_ttip.topic_unique_id
        WHERE 1 = 1
          {output_topic_clause}
        GROUP BY qr.country_id, qr.date_id, t.topic, hdc.hm_count
        ORDER BY qr.date_id, t.topic;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def domain_ranking(
    pool,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    record_id_col = stream_ctx.record_id_col

    q = f"""
        WITH hm_total_count AS (
            SELECT count(*) AS total_count
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
        )
        SELECT
            count(DISTINCT hm.{record_id_col})::float /
                nullif((SELECT total_count FROM hm_total_count), 0) AS frequency,
            t.domain_id,
            dom.name AS domain
        FROM {hm_table} hm
        JOIN {topic_table} ttip
          ON ttip.{record_id_col} = hm.{record_id_col}
         AND ttip.country_id = hm.country_id
         AND ttip.date_id = hm.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = ttip.topic_unique_id
        JOIN {tablename(models.Domain)} dom
          ON dom.id = t.domain_id
        WHERE hm.country_id = {country_id}
          AND hm.date_id BETWEEN {start_date} AND {end_date}
        GROUP BY t.domain_id, dom.name
        ORDER BY frequency DESC;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def talking_points(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    topic_filter_mode: str = "strict",
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    output_topic_clause = topic_output_clause(conditions, topic_filter_mode, "all_ttip")
    prev_start_date, prev_end_date = _previous_period(start_date, end_date)

    q = f"""
        WITH latest_count AS (
            SELECT count(*) AS value
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
        ),
        prev_count AS (
            SELECT count(*) AS value
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {prev_start_date} AND {prev_end_date}
        ),
        filt_prev_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id,
                'prev' AS _type
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {prev_start_date} AND {prev_end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        ),
        filt_latest_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id,
                'latest' AS _type
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        ),
        qualified_records AS (
            SELECT * FROM filt_prev_records
            UNION
            SELECT * FROM filt_latest_records
        ),
        record_domain_metrics AS (
            SELECT
                qr.{record_id_col},
                qr.country_id,
                qr.date_id,
                qr._type,
                t.domain_id,
                dom.name AS domain,
                max(ts.sentiment) AS sentiment
            FROM qualified_records qr
            JOIN {topic_table} all_ttip
              ON all_ttip.{record_id_col} = qr.{record_id_col}
             AND all_ttip.country_id = qr.country_id
             AND all_ttip.date_id = qr.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = qr.{record_id_col}
             AND ts.country_id = qr.country_id
            JOIN {tablename(models.Topic)} t
              ON t.id = all_ttip.topic_unique_id
            JOIN {tablename(models.Domain)} dom
              ON dom.id = t.domain_id
            WHERE 1 = 1
              {output_topic_clause}
            GROUP BY
                qr.{record_id_col},
                qr.country_id,
                qr.date_id,
                qr._type,
                t.domain_id,
                dom.name
        )
        SELECT
            count(*)::float /
                CASE
                    WHEN rdm._type = 'prev' THEN nullif(prev_count.value, 0)
                    WHEN rdm._type = 'latest' THEN nullif(latest_count.value, 0)
                    ELSE 1
                END AS attention,
            avg(rdm.sentiment) AS sentiment,
            rdm.domain_id AS domain_id,
            rdm.domain AS domain,
            rdm._type AS type
        FROM record_domain_metrics rdm
        JOIN latest_count ON true
        JOIN prev_count ON true
        GROUP BY rdm.domain_id, rdm.domain, rdm._type, prev_count.value, latest_count.value
        ORDER BY rdm._type, attention DESC;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def hm_indicator_talking_points(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    topic_filter_mode: str = "strict",
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    output_topic_clause = topic_output_clause(conditions, topic_filter_mode, "all_ttip")
    has_topic_filter = bool(topic_clause.strip())
    prev_start_date, prev_end_date = _previous_period(start_date, end_date)
    indicator_table = f"{models.Topic.__table__.schema}.indicator"
    domain_table = tablename(models.Domain)
    if stream == "tg":
        indicator_positive_table = f"{models.Topic.__table__.schema}.tg_indicator_id_positive"
        match_table = f"{models.Topic.__table__.schema}.tg_topic_id_match"
    else:
        indicator_positive_table = f"{models.Topic.__table__.schema}.mc_indicator_id_positive"
        match_table = f"{models.Topic.__table__.schema}.mc_topic_id_match"

    if has_topic_filter:
        matched_prev_sql = f"""
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id,
                'prev' AS _type
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {prev_start_date} AND {prev_end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        """
        matched_latest_sql = f"""
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id,
                'latest' AS _type
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        """
        record_indicator_metrics_sql = f"""
            SELECT
                qr.{record_id_col},
                qr.country_id,
                qr.date_id,
                qr._type,
                i.id AS indicator_id,
                i.name AS indicator_name,
                max(ts.sentiment) AS sentiment
            FROM qualified_records qr
            JOIN {topic_table} all_ttip
              ON all_ttip.{record_id_col} = qr.{record_id_col}
             AND all_ttip.country_id = qr.country_id
             AND all_ttip.date_id = qr.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = qr.{record_id_col}
             AND ts.country_id = qr.country_id
            JOIN {tablename(models.Topic)} t
              ON t.id = all_ttip.topic_unique_id
            JOIN {indicator_table} i
              ON i.id = t.indicator_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
              AND t.indicator_id IS NOT NULL
              {output_topic_clause}
            GROUP BY
                qr.{record_id_col},
                qr.country_id,
                qr.date_id,
                qr._type,
                i.id,
                i.name
        """
    else:
        matched_prev_sql = f"""
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id,
                'prev' AS _type
            FROM {hm_table} hm
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {prev_start_date} AND {prev_end_date}
              {sentiment_clause}
              {emotion_clause}
        """
        matched_latest_sql = f"""
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id,
                'latest' AS _type
            FROM {hm_table} hm
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {sentiment_clause}
              {emotion_clause}
        """
        record_indicator_metrics_sql = f"""
            SELECT
                qr.{record_id_col},
                qr.country_id,
                qr.date_id,
                qr._type,
                i.id AS indicator_id,
                i.name AS indicator_name,
                max(ts.sentiment) AS sentiment
            FROM qualified_records qr
            JOIN {indicator_positive_table} ip
              ON ip.{record_id_col} = qr.{record_id_col}
             AND ip.country_id = qr.country_id
             AND ip.date_id = qr.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = qr.{record_id_col}
             AND ts.country_id = qr.country_id
            JOIN {indicator_table} i
              ON i.id = ip.indicator_unique_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
            GROUP BY
                qr.{record_id_col},
                qr.country_id,
                qr.date_id,
                qr._type,
                i.id,
                i.name
        """

    q = f"""
        WITH counts AS MATERIALIZED (
            SELECT
                (
                    SELECT count(*)
                    FROM {hm_table} hm
                    WHERE hm.country_id = {country_id}
                      AND hm.date_id BETWEEN {start_date} AND {end_date}
                ) AS latest_value,
                (
                    SELECT count(*)
                    FROM {hm_table} hm
                    WHERE hm.country_id = {country_id}
                      AND hm.date_id BETWEEN {prev_start_date} AND {prev_end_date}
                ) AS prev_value
        ),
        filt_prev_records AS (
            {matched_prev_sql}
        ),
        filt_latest_records AS (
            {matched_latest_sql}
        ),
        qualified_records AS (
            SELECT * FROM filt_prev_records
            UNION
            SELECT * FROM filt_latest_records
        ),
        record_indicator_metrics AS (
            {record_indicator_metrics_sql}
        ),
        indicator_match_term_counts AS (
            SELECT
                qr._type,
                i.id AS indicator_id,
                mt.matched_taxonomy_term,
                sum(mt.match_count) AS total_matches
            FROM qualified_records qr
            JOIN {match_table} mt
              ON mt.{record_id_col} = qr.{record_id_col}
             AND mt.country_id = qr.country_id
             AND mt.date_id = qr.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = mt.topic_unique_id
            JOIN {indicator_table} i
              ON i.id = t.indicator_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
              AND t.indicator_id IS NOT NULL
              {topic_output_clause(conditions, topic_filter_mode, "mt")}
            GROUP BY qr._type, i.id, mt.matched_taxonomy_term
        ),
        indicator_match_terms AS (
            SELECT
                summary._type,
                summary.indicator_id,
                array_agg(summary.matched_taxonomy_term ORDER BY summary.total_matches DESC, summary.matched_taxonomy_term) AS matched_terms
            FROM (
                SELECT
                    imtc._type,
                    imtc.indicator_id,
                    imtc.matched_taxonomy_term,
                    imtc.total_matches,
                    row_number() OVER (
                        PARTITION BY imtc._type, imtc.indicator_id
                        ORDER BY imtc.total_matches DESC, imtc.matched_taxonomy_term
                    ) AS term_rank
                FROM indicator_match_term_counts imtc
            ) summary
            WHERE summary.term_rank <= 5
            GROUP BY summary._type, summary.indicator_id
        )
        SELECT
            count(*)::float /
                CASE
                    WHEN rim._type = 'prev' THEN nullif(counts.prev_value, 0)
                    WHEN rim._type = 'latest' THEN nullif(counts.latest_value, 0)
                    ELSE 1
                END AS attention,
            avg(rim.sentiment) AS sentiment,
            rim.indicator_id AS domain_id,
            rim.indicator_name AS domain,
            rim._type AS type,
            imt.matched_terms
        FROM record_indicator_metrics rim
        CROSS JOIN counts
        LEFT JOIN indicator_match_terms imt
          ON imt._type = rim._type
         AND imt.indicator_id = rim.indicator_id
        GROUP BY rim.indicator_id, rim.indicator_name, rim._type, imt.matched_terms, counts.prev_value, counts.latest_value
        ORDER BY rim._type, attention DESC;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def emotion_trends(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)

    q = f"""
        WITH qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            d.date_actual AS date,
            json_build_object(
                'anger', count(*) FILTER (WHERE ts.anger > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'anticipation', count(*) FILTER (WHERE ts.anticipation > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'disgust', count(*) FILTER (WHERE ts.disgust > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'fear', count(*) FILTER (WHERE ts.fear > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'joy', count(*) FILTER (WHERE ts.joy > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'sadness', count(*) FILTER (WHERE ts.sadness > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'surprise', count(*) FILTER (WHERE ts.surprise > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                'trust', count(*) FILTER (WHERE ts.trust > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0)
            ) AS value,
            c.name || ' - Emotion - ' || '{stream}' AS field
        FROM qualified_records qr
        JOIN {sentiment_table} ts
          ON ts.{record_id_col} = qr.{record_id_col}
         AND ts.country_id = qr.country_id
        JOIN {tablename(models.Date)} d
          ON d.id = qr.date_id
        JOIN {tablename(models.Country)} c
          ON c.country_code = qr.country_id
        GROUP BY d.date_actual, c.name
        ORDER BY d.date_actual;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def overall_time_series(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    trend_type: str,
    interval: str = "auto",
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    field_name = "Social" if stream == "tg" else "Media"
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)

    if trend_type == "attention":
        aggregation_cte = f"""
        hm_bucket_counts AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                count(DISTINCT hm.{record_id_col}) AS hm_count
            FROM {hm_table} hm
            JOIN {tablename(models.Date)} d
              ON d.id = hm.date_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY 1
        ),
        aggregated AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                count(DISTINCT qr.{record_id_col})::float / nullif(hbc.hm_count, 0) AS value
            FROM qualified_records qr
            JOIN {tablename(models.Date)} d
              ON d.id = qr.date_id
            JOIN hm_bucket_counts hbc
              ON hbc.period_start = date_trunc('{resolved_interval}', d.date_actual)::date
            GROUP BY 1, hbc.hm_count
        )
        """
        select_clause = """
            b.period_start AS date,
            '{stream}' AS stream,
            CASE
                WHEN hbc.hm_count IS NULL OR hbc.hm_count = 0 THEN NULL
                ELSE coalesce(a.value, 0)
            END AS value,
            '{field_name}' AS field
        """.replace("{stream}", stream).replace("{field_name}", field_name)
        join_clause = """
        FROM buckets b
        LEFT JOIN hm_bucket_counts hbc
          ON hbc.period_start = b.period_start
        LEFT JOIN aggregated a
          ON a.period_start = b.period_start
        """
    elif trend_type == "sentiment":
        aggregation_cte = f"""
        aggregated AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                avg(ts.sentiment) AS value
            FROM qualified_records qr
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = qr.{record_id_col}
             AND ts.country_id = qr.country_id
            JOIN {tablename(models.Date)} d
              ON d.id = qr.date_id
            GROUP BY 1
        )
        """
        select_clause = """
            b.period_start AS date,
            '{stream}' AS stream,
            a.value AS value,
            '{field_name}' AS field
        """.replace("{stream}", stream).replace("{field_name}", field_name)
        join_clause = """
        FROM buckets b
        LEFT JOIN aggregated a
          ON a.period_start = b.period_start
        """
    else:
        raise ValueError(f"Trend type {trend_type} not supported for human mobility")

    q = f"""
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('{resolved_interval}', to_date('{start_date}', 'YYYYMMDD'))::date,
                date_trunc('{resolved_interval}', to_date('{end_date}', 'YYYYMMDD'))::date,
                interval '1 {resolved_interval}'
            )::date AS period_start
        ),
        qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        ),
        {aggregation_cte}
        SELECT
            {select_clause}
        {join_clause}
        ORDER BY b.period_start;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def anomaly_time_series(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    interval: str = "auto",
):
    stream_ctx = stream_models(stream, alpha_2)
    anomaly_table = tablename(stream_ctx.anomaly_model)
    topic_clause = _topic_filter_clause(conditions)
    field_name = "Social" if stream == "tg" else "Media"
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)

    q = f"""
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('{resolved_interval}', to_date('{start_date}', 'YYYYMMDD'))::date,
                date_trunc('{resolved_interval}', to_date('{end_date}', 'YYYYMMDD'))::date,
                interval '1 {resolved_interval}'
            )::date AS period_start
        ),
        aggregated AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                count(*) FILTER (WHERE agg.is_anomaly) AS value,
                ARRAY_AGG(DISTINCT t.topic) FILTER (WHERE agg.is_anomaly) AS topic_names,
                ARRAY_AGG(DISTINCT t.id) FILTER (WHERE agg.is_anomaly) AS topic_ids
            FROM {anomaly_table} agg
            JOIN {tablename(models.Date)} d
              ON d.id = agg.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = agg.topic_id
            WHERE agg.country_id = {country_id}
              AND agg.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
            GROUP BY 1
        )
        SELECT
            b.period_start AS date,
            '{stream}' AS stream,
            coalesce(a.value, 0) AS value,
            coalesce(a.topic_names, ARRAY[]::text[]) AS topic_names,
            coalesce(a.topic_ids, ARRAY[]::integer[]) AS topic_ids,
            '{field_name}' AS field
        FROM buckets b
        LEFT JOIN aggregated a
          ON a.period_start = b.period_start
        ORDER BY b.period_start;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def hm_indicator_anomaly_trends(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    interval: str = "auto",
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models(stream, alpha_2)
    anomaly_table = tablename(stream_ctx.anomaly_model)
    date_table = tablename(models.Date)
    topic_meta_table = tablename(models.Topic)
    indicator_table = f"{models.Topic.__table__.schema}.indicator"
    domain_table = tablename(models.Domain)
    topic_clause = _topic_filter_clause(conditions, table_alias="agg")
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)

    q = f"""
        WITH indicator_scope AS (
            SELECT
                i.id AS indicator_id,
                i.name AS indicator_name
            FROM {indicator_table} i
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE lower(dom.name) = 'human mobility'
        ),
        buckets AS (
            SELECT generate_series(
                date_trunc('{resolved_interval}', to_date('{start_date}', 'YYYYMMDD'))::date,
                date_trunc('{resolved_interval}', to_date('{end_date}', 'YYYYMMDD'))::date,
                interval '1 {resolved_interval}'
            )::date AS period_start
        ),
        aggregated AS (
            SELECT
                date_trunc('{resolved_interval}', d.date_actual)::date AS period_start,
                i.id AS indicator_id,
                i.name AS indicator_name,
                count(*) FILTER (WHERE agg.is_anomaly) AS value,
                ARRAY_AGG(DISTINCT t.topic ORDER BY t.topic) FILTER (WHERE agg.is_anomaly) AS topic_names,
                ARRAY_AGG(DISTINCT t.id ORDER BY t.id) FILTER (WHERE agg.is_anomaly) AS topic_ids
            FROM {anomaly_table} agg
            JOIN {date_table} d
              ON d.id = agg.date_id
            JOIN {topic_meta_table} t
              ON t.id = agg.topic_id
            JOIN {indicator_table} i
              ON i.id = t.indicator_id
            JOIN {domain_table} dom
              ON dom.id = i.domain_id
            WHERE agg.country_id = {country_id}
              AND agg.date_id BETWEEN {start_date} AND {end_date}
              AND lower(dom.name) = 'human mobility'
              {topic_clause}
            GROUP BY 1, i.id, i.name
        )
        SELECT
            extract(epoch FROM b.period_start)::bigint * 1000 AS date,
            b.period_start::text AS period,
            s.indicator_id,
            s.indicator_name,
            coalesce(a.value, 0) AS value,
            coalesce(a.topic_names, ARRAY[]::text[]) AS topic_names,
            coalesce(a.topic_ids, ARRAY[]::integer[]) AS topic_ids
        FROM buckets b
        CROSS JOIN indicator_scope s
        LEFT JOIN aggregated a
          ON a.period_start = b.period_start
         AND a.indicator_id = s.indicator_id
        ORDER BY b.period_start, s.indicator_name;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return {
                "stream": stream,
                "interval": resolved_interval,
                "requested_interval": interval,
                "period": {"start_date": start_date, "end_date": end_date},
                "data": await cur.fetchall(),
            }


async def tfidf_day_agg_top_terms(
    pool,
    alpha_2: str,
    start_date: int,
    end_date: int,
    stream: str = "tg",
    limit: int = 50,
    metric: str = "period_average",
    max_document_frequency: float = 0.80,
):
    if stream != "tg":
        raise ValueError(f"Stream {stream} not allowed for human mobility tfidf")
    model = models.TgHumanMobilityTFIDFDayAgg[alpha_2.strip().lower()]
    hm_model = models.TgHumanMobilityMessageCountry[alpha_2.strip().lower()]

    if metric == "period_average":
        q = f"""
            WITH active_days AS (
                SELECT count(DISTINCT hm.date_id)::float AS value
                FROM {tablename(hm_model)} hm
                WHERE hm.date_id BETWEEN {start_date} AND {end_date}
            ),
            corpus_days AS (
                SELECT count(DISTINCT hm.date_id)::float AS value
                FROM {tablename(hm_model)} hm
            ),
            allowed_terms AS (
                SELECT tz.lemma
                FROM {tablename(model)} tz
                CROSS JOIN corpus_days
                GROUP BY tz.lemma, corpus_days.value
                HAVING count(DISTINCT tz.date_id)::float /
                    nullif(corpus_days.value, 0) < {max_document_frequency}
            )
            SELECT
                tz.lemma AS lemma,
                sum(tz.tfidf) / nullif(active_days.value, 0) AS mean_value
            FROM {tablename(model)} tz
            JOIN allowed_terms USING (lemma)
            CROSS JOIN active_days
            WHERE tz.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY tz.lemma, active_days.value
            ORDER BY mean_value DESC
            LIMIT {limit};
        """
    elif metric == "daily_peak":
        q = f"""
            WITH corpus_days AS (
                SELECT count(DISTINCT hm.date_id)::float AS value
                FROM {tablename(hm_model)} hm
            ),
            allowed_terms AS (
                SELECT tz.lemma
                FROM {tablename(model)} tz
                CROSS JOIN corpus_days
                GROUP BY tz.lemma, corpus_days.value
                HAVING count(DISTINCT tz.date_id)::float /
                    nullif(corpus_days.value, 0) < {max_document_frequency}
            )
            SELECT
                tz.date_id,
                tz.lemma,
                tz.tfidf AS mean_value
            FROM {tablename(model)} tz
            JOIN allowed_terms USING (lemma)
            WHERE tz.date_id BETWEEN {start_date} AND {end_date}
            ORDER BY tz.tfidf DESC, tz.date_id DESC, tz.lemma
            LIMIT {limit};
        """
    else:
        raise ValueError(f"TF-IDF metric {metric} not allowed")

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def chart_studio_time_series_from_stream(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    field,
):
    stream = field["stream"]
    field_type = field["type"]
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    suffix = "(Social)" if stream == "tg" else "(Media)"

    if field_type == "anomaly":
        anomaly_table = tablename(stream_ctx.anomaly_model)
        anomaly_topic_clause = _topic_filter_clause(conditions, table_alias="agg")
        q = f"""
            SELECT
                d.date_actual AS date,
                '{stream}' AS stream,
                count(*) FILTER (WHERE agg.is_anomaly) AS value,
                ARRAY_AGG(t.topic ORDER BY t.topic) FILTER (WHERE agg.is_anomaly) AS topic_names,
                c.name || ' - ' || '{suffix}' AS field
            FROM {anomaly_table} agg
            JOIN {tablename(models.Date)} d
              ON d.id = agg.date_id
            JOIN {tablename(models.Topic)} t
              ON t.id = agg.topic_id
            JOIN {tablename(models.Country)} c
              ON c.country_code = agg.country_id
            WHERE agg.country_id = {country_id}
              AND agg.date_id BETWEEN {start_date} AND {end_date}
              {anomaly_topic_clause}
            GROUP BY d.date_actual, c.name
            ORDER BY d.date_actual;
        """
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(q)
                return await cur.fetchall()

    qualified_records_cte = f"""
        qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
    """

    if field_type == "attention":
        q = f"""
            WITH hm_daily_count AS (
                SELECT hm.country_id, hm.date_id, count(*) AS hm_count
                FROM {hm_table} hm
                WHERE hm.country_id = {country_id}
                  AND hm.date_id BETWEEN {start_date} AND {end_date}
                GROUP BY hm.country_id, hm.date_id
            ),
            {qualified_records_cte}
            SELECT
                d.date_actual AS date,
                '{stream}' AS stream,
                count(DISTINCT qr.{record_id_col})::float / nullif(hdc.hm_count, 0) AS value,
                c.name || ' - ' || t.topic || ' - ' || '{suffix}' AS field
            FROM qualified_records qr
            JOIN {topic_table} all_ttip
              ON all_ttip.{record_id_col} = qr.{record_id_col}
             AND all_ttip.country_id = qr.country_id
             AND all_ttip.date_id = qr.date_id
            JOIN hm_daily_count hdc
              ON hdc.country_id = qr.country_id
             AND hdc.date_id = qr.date_id
            JOIN {tablename(models.Date)} d
              ON d.id = qr.date_id
            JOIN {tablename(models.Country)} c
              ON c.country_code = qr.country_id
            JOIN {tablename(models.Topic)} t
              ON t.id = all_ttip.topic_unique_id
            GROUP BY qr.country_id, d.date_actual, t.topic, hdc.hm_count, c.name
            ORDER BY d.date_actual, t.topic;
        """
    elif field_type == "sentiment":
        q = f"""
            WITH {qualified_records_cte}
            SELECT
                d.date_actual AS date,
                '{stream}' AS stream,
                avg(ts.sentiment) AS value,
                '{"Social" if stream == "tg" else "Media"}' AS field
            FROM qualified_records qr
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = qr.{record_id_col}
             AND ts.country_id = qr.country_id
            JOIN {tablename(models.Date)} d
              ON d.id = qr.date_id
            GROUP BY d.date_actual
            ORDER BY d.date_actual;
        """
    elif field_type == "emotion":
        q = f"""
            WITH {qualified_records_cte}
            SELECT
                d.date_actual AS date,
                '{stream}' AS stream,
                json_build_object(
                    'anger', count(*) FILTER (WHERE ts.anger > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'anticipation', count(*) FILTER (WHERE ts.anticipation > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'disgust', count(*) FILTER (WHERE ts.disgust > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'fear', count(*) FILTER (WHERE ts.fear > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'joy', count(*) FILTER (WHERE ts.joy > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'sadness', count(*) FILTER (WHERE ts.sadness > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'surprise', count(*) FILTER (WHERE ts.surprise > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0),
                    'trust', count(*) FILTER (WHERE ts.trust > 0)::float / nullif(count(DISTINCT qr.{record_id_col}), 0)
                ) AS value,
                c.name || ' - Emotion - ' || '{suffix}' AS field
            FROM qualified_records qr
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = qr.{record_id_col}
             AND ts.country_id = qr.country_id
            JOIN {tablename(models.Date)} d
              ON d.id = qr.date_id
            JOIN {tablename(models.Country)} c
              ON c.country_code = qr.country_id
            GROUP BY d.date_actual, c.name
            ORDER BY d.date_actual;
        """
    else:
        raise ValueError(f"Field type {field_type} not supported for human mobility chart studio")

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def chart_studio_bar_chart_from_stream(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    field,
):
    stream = field["stream"]
    field_type = field["type"]
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    anomaly_table = tablename(stream_ctx.anomaly_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    anomaly_topic_clause = _topic_filter_clause(conditions, table_alias="agg")
    suffix = "(Social)" if stream == "tg" else "(Media)"

    if field_type == "anomaly":
        date1 = dt.datetime.strptime(str(start_date), "%Y%m%d")
        date2 = dt.datetime.strptime(str(end_date), "%Y%m%d")
        day_difference = (date2 - date1).days + 1
        q = f"""
            SELECT
                count(*) FILTER (WHERE agg.is_anomaly)::float / {day_difference} AS frequency,
                c.name || ' - ' || t.topic || ' - ' || '{suffix}' AS field
            FROM {anomaly_table} agg
            JOIN {tablename(models.Topic)} t
              ON t.id = agg.topic_id
            JOIN {tablename(models.Country)} c
              ON c.country_code = agg.country_id
            WHERE agg.country_id = {country_id}
              AND agg.date_id BETWEEN {start_date} AND {end_date}
              {anomaly_topic_clause}
            GROUP BY agg.country_id, agg.topic_id, t.topic, c.name
            ORDER BY frequency DESC;
        """
    else:
        qualified_records_cte = f"""
            qualified_records AS (
                SELECT DISTINCT
                    hm.{record_id_col},
                    hm.country_id,
                    hm.date_id
                FROM {hm_table} hm
                JOIN {topic_table} ttip
                  ON ttip.{record_id_col} = hm.{record_id_col}
                 AND ttip.country_id = hm.country_id
                 AND ttip.date_id = hm.date_id
                JOIN {sentiment_table} ts
                  ON ts.{record_id_col} = hm.{record_id_col}
                 AND ts.country_id = hm.country_id
                WHERE hm.country_id = {country_id}
                  AND hm.date_id BETWEEN {start_date} AND {end_date}
                  {topic_clause}
                  {sentiment_clause}
                  {emotion_clause}
            )
        """
        if field_type == "attention":
            q = f"""
                WITH hm_total_count AS (
                    SELECT count(*) AS total_count
                    FROM {hm_table} hm
                    WHERE hm.country_id = {country_id}
                      AND hm.date_id BETWEEN {start_date} AND {end_date}
                ),
                {qualified_records_cte}
                SELECT
                    count(DISTINCT qr.{record_id_col})::float /
                        nullif((SELECT total_count FROM hm_total_count), 0) AS frequency,
                    c.name || ' - ' || t.topic || ' - ' || '{suffix}' AS field
                FROM qualified_records qr
                JOIN {topic_table} all_ttip
                  ON all_ttip.{record_id_col} = qr.{record_id_col}
                 AND all_ttip.country_id = qr.country_id
                 AND all_ttip.date_id = qr.date_id
                JOIN {tablename(models.Topic)} t
                  ON t.id = all_ttip.topic_unique_id
                JOIN {tablename(models.Country)} c
                  ON c.country_code = qr.country_id
                GROUP BY qr.country_id, t.topic, c.name
                ORDER BY frequency DESC;
            """
        elif field_type == "sentiment":
            q = f"""
                WITH hm_total_count AS (
                    SELECT count(*) AS total_count
                    FROM {hm_table} hm
                    WHERE hm.country_id = {country_id}
                      AND hm.date_id BETWEEN {start_date} AND {end_date}
                ),
                {qualified_records_cte}
                SELECT
                    json_build_object(
                        'positive', count(*) FILTER (WHERE ts.sentiment > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'negative', count(*) FILTER (WHERE ts.sentiment < 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'neutral', count(*) FILTER (WHERE ts.sentiment = 0)::float / nullif((SELECT total_count FROM hm_total_count), 0)
                    ) AS frequency,
                    c.name || ' - Sentiment - ' || '{suffix}' AS field
                FROM qualified_records qr
                JOIN {sentiment_table} ts
                  ON ts.{record_id_col} = qr.{record_id_col}
                 AND ts.country_id = qr.country_id
                JOIN {tablename(models.Country)} c
                  ON c.country_code = qr.country_id
                GROUP BY qr.country_id, c.name;
            """
        elif field_type == "emotion":
            q = f"""
                WITH hm_total_count AS (
                    SELECT count(*) AS total_count
                    FROM {hm_table} hm
                    WHERE hm.country_id = {country_id}
                      AND hm.date_id BETWEEN {start_date} AND {end_date}
                ),
                {qualified_records_cte}
                SELECT
                    json_build_object(
                        'anger', count(*) FILTER (WHERE ts.anger > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'anticipation', count(*) FILTER (WHERE ts.anticipation > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'disgust', count(*) FILTER (WHERE ts.disgust > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'fear', count(*) FILTER (WHERE ts.fear > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'joy', count(*) FILTER (WHERE ts.joy > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'sadness', count(*) FILTER (WHERE ts.sadness > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'surprise', count(*) FILTER (WHERE ts.surprise > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0),
                        'trust', count(*) FILTER (WHERE ts.trust > 0)::float / nullif((SELECT total_count FROM hm_total_count), 0)
                    ) AS frequency,
                    c.name || ' - Emotion - ' || '{suffix}' AS field
                FROM qualified_records qr
                JOIN {sentiment_table} ts
                  ON ts.{record_id_col} = qr.{record_id_col}
                 AND ts.country_id = qr.country_id
                JOIN {tablename(models.Country)} c
                  ON c.country_code = qr.country_id
                GROUP BY qr.country_id, c.name;
            """
        else:
            raise ValueError(f"Field type {field_type} not supported for human mobility chart studio")

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def hot_topics_with_topic_condition(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
    topic_filter_mode: str = "strict",
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    output_topic_clause = topic_output_clause(conditions, topic_filter_mode, "all_ttip")

    q = f"""
        WITH hm_total_count AS (
            SELECT count(*) AS total_count
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
        ),
        qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            count(DISTINCT qr.{record_id_col})::float /
                nullif((SELECT total_count FROM hm_total_count), 0) AS frequency,
            t.topic AS topic
        FROM qualified_records qr
        JOIN {topic_table} all_ttip
          ON all_ttip.{record_id_col} = qr.{record_id_col}
         AND all_ttip.country_id = qr.country_id
         AND all_ttip.date_id = qr.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = all_ttip.topic_unique_id
        WHERE 1 = 1
          {output_topic_clause}
        GROUP BY t.topic
        ORDER BY frequency DESC;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def hot_topics_without_topic_condition(
    pool,
    conditions,
    alpha_2: str,
    country_id: int,
    start_date: int,
    end_date: int,
    stream: str,
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)

    q = f"""
        WITH hm_total_count AS (
            SELECT count(*) AS total_count
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
        ),
        qualified_records AS (
            SELECT DISTINCT
                hm.{record_id_col},
                hm.country_id,
                hm.date_id
            FROM {hm_table} hm
            JOIN {topic_table} ttip
              ON ttip.{record_id_col} = hm.{record_id_col}
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {sentiment_table} ts
              ON ts.{record_id_col} = hm.{record_id_col}
             AND ts.country_id = hm.country_id
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            count(DISTINCT qr.{record_id_col})::float /
                nullif((SELECT total_count FROM hm_total_count), 0) AS frequency,
            t.domain_id,
            dom.name AS domain
        FROM qualified_records qr
        JOIN {topic_table} all_ttip
          ON all_ttip.{record_id_col} = qr.{record_id_col}
         AND all_ttip.country_id = qr.country_id
         AND all_ttip.date_id = qr.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = all_ttip.topic_unique_id
        JOIN {tablename(models.Domain)} dom
          ON dom.id = t.domain_id
        GROUP BY t.domain_id, dom.name
        ORDER BY frequency DESC;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def tg_messages(
    pool,
    alpha_2: str,
    start_date: int,
    end_date: int,
    sorted_by: str = "date",
    limit: int = 10,
    conditions=None,
    offset: int = 0,
):
    alpha_2 = alpha_2.strip().lower()
    hm_table = tablename(models.TgHumanMobilityMessageCountry[alpha_2])
    message_table = tablename(models.TgMessageCountry[alpha_2])
    channel_table = tablename(models.TgChannel)
    indicator_table = f"{models.Topic.__table__.schema}.indicator"
    domain_table = tablename(models.Domain)
    match_table = f"{models.Topic.__table__.schema}.tg_topic_id_match"
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    sorted_by = sorted_by.strip().lower()
    order_col = "ms.timestamp" if sorted_by != "sentiment" else "ts.sentiment"

    q = f"""
        WITH matched_records AS (
            SELECT DISTINCT hm.message_unique_id, hm.country_id
            FROM {hm_table} hm
            JOIN {tablename(models.TgTopicIdPositive)} ttip
              ON ttip.message_unique_id = hm.message_unique_id
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {tablename(models.TgSentiment)} ts
              ON ts.message_unique_id = hm.message_unique_id
             AND ts.country_id = hm.country_id
            WHERE hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            ms.unique_id AS unique_id,
            ms.username AS username,
            ms.author_username AS author_username,
            tc.username AS channel_username,
            tc.title AS channel_title,
            ms.message_id AS message_id,
            ms.timestamp AS timestamp,
            CASE
                WHEN lower(tc.language) = 'english' THEN ms.body
                ELSE ms.body_en
            END AS body,
            (
                SELECT json_agg(component_row ORDER BY component_row.hm_rank, component_row.indicator_name, component_row.component_name)
                FROM (
                    SELECT DISTINCT
                        CASE
                            WHEN lower(dom.name) = 'human mobility' THEN 0
                            ELSE 1
                        END AS hm_rank,
                        coalesce(i.name, dom.name) AS indicator_name,
                        t2.topic AS component_name,
                        dom.name AS domain_name,
                        (
                            SELECT array_agg(term_row.matched_taxonomy_term ORDER BY term_row.total_matches DESC, term_row.matched_taxonomy_term)
                            FROM (
                                SELECT
                                    mt.matched_taxonomy_term,
                                    sum(mt.match_count) AS total_matches
                                FROM {match_table} mt
                                WHERE mt.message_unique_id = ms.unique_id
                                  AND mt.country_id = ms.country_id
                                  AND mt.topic_unique_id = t2.id
                                GROUP BY mt.matched_taxonomy_term
                                ORDER BY total_matches DESC, mt.matched_taxonomy_term
                                LIMIT 5
                            ) term_row
                        ) AS matched_terms
                    FROM {tablename(models.TgTopicIdPositive)} all_ttip2
                    JOIN {tablename(models.Topic)} t2
                      ON t2.id = all_ttip2.topic_unique_id
                    LEFT JOIN {indicator_table} i
                      ON i.id = t2.indicator_id
                    LEFT JOIN {domain_table} dom
                      ON dom.id = coalesce(i.domain_id, t2.domain_id)
                    WHERE all_ttip2.message_unique_id = ms.unique_id
                      AND all_ttip2.country_id = ms.country_id
                ) component_row
            ) AS detected_components
        FROM matched_records mr
        JOIN {message_table} ms
          ON ms.unique_id = mr.message_unique_id
         AND ms.country_id = mr.country_id
        JOIN {tablename(models.TgSentiment)} ts
          ON ts.message_unique_id = mr.message_unique_id
         AND ts.country_id = mr.country_id
        JOIN {channel_table} tc
          ON ms.channel_id = tc.channel_id
        GROUP BY ms.unique_id, ms.username, ms.author_username, ms.message_id,
                 ms.timestamp, ms.body, ms.body_en, ms.country_id, tc.language, ts.sentiment, tc.username, tc.title
        ORDER BY {order_col} DESC
        LIMIT {limit}
        OFFSET {offset};
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


async def mc_stories(
    pool,
    alpha_2: str,
    start_date: int,
    end_date: int,
    sorted_by: str = "date",
    limit: int = 10,
    conditions=None,
    offset: int = 0,
):
    alpha_2 = alpha_2.strip().lower()
    hm_table = tablename(models.MCHumanMobilityStoryCountry[alpha_2])
    story_table = tablename(models.MCStoryCountry[alpha_2])
    indicator_table = f"{models.Topic.__table__.schema}.indicator"
    domain_table = tablename(models.Domain)
    match_table = f"{models.Topic.__table__.schema}.mc_topic_id_match"
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    sorted_by = sorted_by.strip().lower()
    order_col = "ms.publish_date" if sorted_by != "sentiment" else "ts.sentiment"

    q = f"""
        WITH matched_records AS (
            SELECT DISTINCT hm.story_id, hm.country_id
            FROM {hm_table} hm
            JOIN {tablename(models.MCTopicIdPositive)} ttip
              ON ttip.story_id = hm.story_id
             AND ttip.country_id = hm.country_id
             AND ttip.date_id = hm.date_id
            JOIN {tablename(models.MCSentiment)} ts
              ON ts.story_id = hm.story_id
             AND ts.country_id = hm.country_id
            WHERE hm.date_id BETWEEN {start_date} AND {end_date}
              {topic_clause}
              {sentiment_clause}
              {emotion_clause}
        )
        SELECT
            ms.id,
            ms.media_name AS username,
            ms.url AS url,
            ms.publish_date AS timestamp,
            ms.indexed_date,
            CASE
                WHEN lower(ms.language) = 'en' THEN ms.title
                ELSE ms.body_en
            END AS body,
            array_agg(DISTINCT t.topic ORDER BY t.topic) AS detected_topics,
            (
                SELECT json_agg(component_row ORDER BY component_row.hm_rank, component_row.indicator_name, component_row.component_name)
                FROM (
                    SELECT DISTINCT
                        CASE
                            WHEN lower(dom.name) = 'human mobility' THEN 0
                            ELSE 1
                        END AS hm_rank,
                        coalesce(i.name, dom.name) AS indicator_name,
                        t2.topic AS component_name,
                        dom.name AS domain_name,
                        (
                            SELECT array_agg(term_row.matched_taxonomy_term ORDER BY term_row.total_matches DESC, term_row.matched_taxonomy_term)
                            FROM (
                                SELECT
                                    mt.matched_taxonomy_term,
                                    sum(mt.match_count) AS total_matches
                                FROM {match_table} mt
                                WHERE mt.story_id = ms.id
                                  AND mt.country_id = ms.country_id
                                  AND mt.topic_unique_id = t2.id
                                GROUP BY mt.matched_taxonomy_term
                                ORDER BY total_matches DESC, mt.matched_taxonomy_term
                                LIMIT 5
                            ) term_row
                        ) AS matched_terms
                    FROM {tablename(models.MCTopicIdPositive)} all_ttip2
                    JOIN {tablename(models.Topic)} t2
                      ON t2.id = all_ttip2.topic_unique_id
                    LEFT JOIN {indicator_table} i
                      ON i.id = t2.indicator_id
                    LEFT JOIN {domain_table} dom
                      ON dom.id = coalesce(i.domain_id, t2.domain_id)
                    WHERE all_ttip2.story_id = ms.id
                      AND all_ttip2.country_id = ms.country_id
                ) component_row
            ) AS detected_components
        FROM matched_records mr
        JOIN {story_table} ms
          ON ms.id = mr.story_id
         AND ms.country_id = mr.country_id
        JOIN {tablename(models.MCSentiment)} ts
          ON ts.story_id = mr.story_id
         AND ts.country_id = mr.country_id
        JOIN {tablename(models.MCTopicIdPositive)} all_ttip
          ON all_ttip.story_id = mr.story_id
         AND all_ttip.country_id = mr.country_id
        JOIN {tablename(models.Topic)} t
          ON t.id = all_ttip.topic_unique_id
        GROUP BY ms.id, ms.media_name, ms.url, ms.publish_date, ms.indexed_date,
                 ms.language, ms.title, ms.body_en, ts.sentiment
        ORDER BY {order_col} DESC, ms.indexed_date DESC
        OFFSET {offset}
        LIMIT {limit};
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()
