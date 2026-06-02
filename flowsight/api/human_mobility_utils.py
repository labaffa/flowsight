from dataclasses import dataclass
import datetime as dt

from psycopg.rows import dict_row

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
):
    alpha_2 = alpha_2.strip().lower()
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    hm_record_id_col = stream_ctx.record_id_col
    resolved_interval = _resolve_coverage_interval(start_date, end_date, interval)
    previous_start_date, previous_end_date = _previous_period(start_date, end_date)

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

    series_q = f"""
        WITH buckets AS (
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
                date_trunc('{resolved_interval}', to_date(hm.date_id::text, 'YYYYMMDD'))::date AS period_start,
                count(DISTINCT hm.{hm_record_id_col}) AS hm_records
            FROM {hm_table} hm
            WHERE hm.country_id = {country_id}
              AND hm.date_id BETWEEN {start_date} AND {end_date}
            GROUP BY 1
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
    summary_q = f"""
        SELECT
            (SELECT count(DISTINCT raw.{raw_record_id_col})
             FROM {raw_table} raw
             WHERE raw.country_id = {country_id}
               AND raw.{raw_date_col}::date BETWEEN to_date('{start_date}', 'YYYYMMDD')
                                                AND to_date('{end_date}', 'YYYYMMDD')) AS all_records,
            (SELECT count(DISTINCT hm.{hm_record_id_col})
             FROM {hm_table} hm
             WHERE hm.country_id = {country_id}
               AND hm.date_id BETWEEN {start_date} AND {end_date}) AS hm_records,
            (SELECT count(DISTINCT raw.{raw_record_id_col})
             FROM {raw_table} raw
             WHERE raw.country_id = {country_id}
               AND raw.{raw_date_col}::date BETWEEN to_date('{previous_start_date}', 'YYYYMMDD')
                                                AND to_date('{previous_end_date}', 'YYYYMMDD')) AS previous_all_records,
            (SELECT count(DISTINCT hm.{hm_record_id_col})
             FROM {hm_table} hm
             WHERE hm.country_id = {country_id}
               AND hm.date_id BETWEEN {previous_start_date} AND {previous_end_date}) AS previous_hm_records;
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
            sum(ttip.topic_norm_prevalence) / hdc.hm_count AS value
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
            sum(all_ttip.topic_norm_prevalence) / hdc.hm_count AS value
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
            sum(all_ttip.topic_norm_prevalence) / hdc.hm_count AS value,
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
                'anger', avg(ts.anger::float),
                'anticipation', avg(ts.anticipation::float),
                'disgust', avg(ts.disgust::float),
                'fear', avg(ts.fear::float),
                'joy', avg(ts.joy::float),
                'sadness', avg(ts.sadness::float),
                'surprise', avg(ts.surprise::float),
                'trust', avg(ts.trust::float)
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
):
    stream_ctx = stream_models(stream, alpha_2)
    hm_table = tablename(stream_ctx.hm_model)
    topic_table = tablename(stream_ctx.topic_model)
    sentiment_table = tablename(stream_ctx.sentiment_model)
    record_id_col = stream_ctx.record_id_col
    topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    field_name = "Social" if stream == "tg" else "Media"

    if trend_type == "attention":
        value_clause = "sum(all_ttip.topic_norm_prevalence) / nullif(hdc.hm_count, 0) AS value"
        group_by_clause = "GROUP BY d.date_actual, qr.country_id, qr.date_id, hdc.hm_count"
        joins = f"""
            JOIN {topic_table} all_ttip
              ON all_ttip.{record_id_col} = qr.{record_id_col}
             AND all_ttip.country_id = qr.country_id
             AND all_ttip.date_id = qr.date_id
            JOIN hm_daily_count hdc
              ON hdc.country_id = qr.country_id
             AND hdc.date_id = qr.date_id
        """
    elif trend_type == "sentiment":
        value_clause = "avg(ts.sentiment) AS value"
        group_by_clause = "GROUP BY d.date_actual, qr.country_id, qr.date_id"
        joins = ""
    else:
        raise ValueError(f"Trend type {trend_type} not supported for human mobility")

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
            '{stream}' AS stream,
            {value_clause},
            '{field_name}' AS field
        FROM qualified_records qr
        JOIN {sentiment_table} ts
          ON ts.{record_id_col} = qr.{record_id_col}
         AND ts.country_id = qr.country_id
        {joins}
        JOIN {tablename(models.Date)} d
          ON d.id = qr.date_id
        {group_by_clause}
        ORDER BY d.date_actual;
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
):
    stream_ctx = stream_models(stream, alpha_2)
    anomaly_table = tablename(stream_ctx.anomaly_model)
    topic_clause = _topic_filter_clause(conditions)
    field_name = "Social" if stream == "tg" else "Media"

    q = f"""
        SELECT
            d.date_actual AS date,
            '{stream}' AS stream,
            count(*) FILTER (WHERE agg.is_anomaly) AS value,
            ARRAY_AGG(t.topic ORDER BY t.topic) FILTER (WHERE agg.is_anomaly) AS topic_names,
            ARRAY_AGG(t.id ORDER BY t.topic) FILTER (WHERE agg.is_anomaly) AS topic_ids,
            '{field_name}' AS field
        FROM {anomaly_table} agg
        JOIN {tablename(models.Date)} d
          ON d.id = agg.date_id
        JOIN {tablename(models.Topic)} t
          ON t.id = agg.topic_id
        WHERE agg.country_id = {country_id}
          AND agg.date_id BETWEEN {start_date} AND {end_date}
          {topic_clause}
        GROUP BY d.date_actual
        ORDER BY d.date_actual;
    """

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            return await cur.fetchall()


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
                sum(all_ttip.topic_norm_prevalence) / hdc.hm_count AS value,
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
                    'anger', avg(ts.anger::float),
                    'anticipation', avg(ts.anticipation::float),
                    'disgust', avg(ts.disgust::float),
                    'fear', avg(ts.fear::float),
                    'joy', avg(ts.joy::float),
                    'sadness', avg(ts.sadness::float),
                    'surprise', avg(ts.surprise::float),
                    'trust', avg(ts.trust::float)
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
            ms.message_id AS message_id,
            ms.timestamp AS timestamp,
            CASE
                WHEN lower(tc.language) = 'english' THEN ms.body
                ELSE ms.body_en
            END AS body,
            array_agg(DISTINCT t.topic ORDER BY t.topic) AS detected_topics
        FROM matched_records mr
        JOIN {message_table} ms
          ON ms.unique_id = mr.message_unique_id
         AND ms.country_id = mr.country_id
        JOIN {tablename(models.TgSentiment)} ts
          ON ts.message_unique_id = mr.message_unique_id
         AND ts.country_id = mr.country_id
        JOIN {tablename(models.TgTopicIdPositive)} all_ttip
          ON all_ttip.message_unique_id = mr.message_unique_id
         AND all_ttip.country_id = mr.country_id
        JOIN {tablename(models.Topic)} t
          ON t.id = all_ttip.topic_unique_id
        JOIN {tablename(models.TgChannel)} tc
          ON ms.channel_id = tc.channel_id
        GROUP BY ms.unique_id, ms.username, ms.author_username, ms.message_id,
                 ms.timestamp, ms.body, ms.body_en, tc.language, ts.sentiment
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
            array_agg(DISTINCT t.topic ORDER BY t.topic) AS detected_topics
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
