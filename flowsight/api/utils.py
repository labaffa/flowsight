from flowsight.db.models import TgSentimentDayDomainAgg, \
    TopicIdDayDomainAggTg, MCTopicIdDayDomainAgg, MCSentimentDayDomainAgg
from flowsight.db import models
from flowsight.db.utils import tablename
from psycopg.rows import dict_row
import datetime as dt
from collections import defaultdict
from dateutil.parser import parse
import json
from typing import Iterable


SQL_GEN_MAPPING = {
    "fields": {
        "Topic": models.TgTopicIdPositive,
        "Sentiment": models.MCSentiment,
        "Emotion": models.MCSentiment
    },
    "operators": {
        "IS": "=",
        "IS NOT": "!="
    }


}
async def get_framework(pool):
    q = (f'''
        SELECT 
            t.id as topic_id, t.topic, t.theme, t.sub_theme, t.domain_id
            , d.name as domain
        FROM {tablename(models.Topic)} t 
        JOIN {tablename(models.Domain)} d ON t.domain_id = d.id
        ;''')
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result
    

async def latest_attention_and_sentiment_per_domain(pool):
    q = (f'''
        with row_numbers as (
            SELECT 
                dense_rank() over (
                    partition by tti.country_id, tti.domain_id 
                    order by (tti.date_id) desc
                ) as row_num
                ,tti.domain_id as domain_id 
                , tti.date_id as date_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , tti.topic_norm_prevalence as value  
                , 'attention' as analysis
                , 'tg' as data_stream
            from {tablename(TopicIdDayDomainAggTg)} tti
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code
            
            union all
            
            SELECT 
                dense_rank() over (
                    partition by tti.country_id, tti.domain_id 
                    order by (tti.date_id) desc
                ) as row_num
                ,tti.domain_id as domain_id 
                , tti.date_id as date_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , tti.sentiment as value  
                , 'sentiment' as analysis
                , 'tg' as data_stream
            from {tablename(TgSentimentDayDomainAgg)} tti
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code

            
            union all
            
            SELECT 
                dense_rank() over (
                    partition by tti.country_id, tti.domain_id 
                    order by (tti.date_id) desc
                ) as row_num
                ,tti.domain_id as domain_id 
                , tti.date_id as date_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , tti.sentiment as value  
                , 'sentiment' as analysis
                , 'mc' as data_stream
            from {tablename(MCSentimentDayDomainAgg)} tti
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code

            
            union all
            
            SELECT 
                dense_rank() over (
                    partition by tti.country_id, tti.domain_id 
                    order by (tti.date_id) desc
                ) as row_num
                ,tti.domain_id as domain_id 
                , tti.date_id as date_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , tti.topic_norm_prevalence as value  
                , 'attention' as analysis
                , 'mc' as data_stream
            from {tablename(MCTopicIdDayDomainAgg)} tti
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code

            union all

            SELECT 
                dense_rank() over (
                    partition by tti.country_id, top.domain_id
                    order by (tti.date_id) desc
                ) as row_num
                , top.domain_id as domain_id 
                , tti.date_id as date_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , count(*) filter(where is_anomaly) as value  
                , 'anomaly' as analysis
                , 'tg' as data_stream
            from {tablename(models.TopicIdDayAggTg)} tti
            join {tablename(models.Topic)} top on tti.topic_id = top.id
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code
            group by tti.country_id, top.domain_id, tti.date_id, cou.alpha_2

            union all

            SELECT 
                dense_rank() over (
                    partition by tti.country_id, top.domain_id
                    order by (tti.date_id) desc
                ) as row_num
                , top.domain_id as domain_id 
                , tti.date_id as date_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , count(*) filter(where is_anomaly) as value  
                , 'anomaly' as analysis
                , 'mc' as data_stream
            from {tablename(models.MCTopicIdDayAgg)} tti
            join {tablename(models.Topic)} top on tti.topic_id = top.id
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code
            group by tti.country_id, top.domain_id, tti.date_id, cou.alpha_2            
            
    )
    select domain_id, date_id, country_id, value, analysis, data_stream, alpha_2 from row_numbers 
    where row_num = 1
    ;
    ''')
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def layers_data_for_given_time_period(pool, start_date, end_date):
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1

    q = (f'''
        SELECT 
            tti.domain_id as domain_id 
            , tti.country_id as country_id 
            , lower(cou.alpha_2) as alpha_2
            , sum(tti.topic_norm_prevalence)/{day_difference} as value  
            , ARRAY[]::text[] as topic_names 
            , 'attention' as analysis
            , 'tg' as data_stream
        from {tablename(TopicIdDayDomainAggTg)} tti
        join {tablename(models.Country)} cou on tti.country_id = cou.country_code
        WHERE tti.date_id BETWEEN {start_date} AND {end_date}
        group by tti.country_id , tti.domain_id , cou.alpha_2 

        union all

        SELECT 
            tti.domain_id as domain_id 
            , tti.country_id as country_id 
            , lower(cou.alpha_2) as alpha_2
            , sum(tti.topic_norm_prevalence)/{day_difference} as value  
            , ARRAY[]::text[] as topic_names 
            , 'attention' as analysis
            , 'mc' as data_stream
        from {tablename(MCTopicIdDayDomainAgg)} tti
        join {tablename(models.Country)} cou on tti.country_id = cou.country_code
        WHERE tti.date_id BETWEEN {start_date} AND {end_date}
        group by tti.country_id , tti.domain_id , cou.alpha_2 

        union all

        SELECT 
            tti.domain_id as domain_id 
            , tti.country_id as country_id 
            , lower(cou.alpha_2) as alpha_2
            , avg(tti.sentiment) as value  
            , ARRAY[]::text[] as topic_names 
            , 'sentiment' as analysis
            , 'tg' as data_stream
        from {tablename(models.TgSentimentDayDomainAgg)} tti
        join {tablename(models.Country)} cou on tti.country_id = cou.country_code
        WHERE tti.date_id BETWEEN {start_date} AND {end_date}
        group by tti.country_id , tti.domain_id , cou.alpha_2 

       
        union all    
 
        SELECT 
            tti.domain_id as domain_id 
            , tti.country_id as country_id 
            , lower(cou.alpha_2) as alpha_2
            , avg(tti.sentiment) as value 
            , ARRAY[]::text[] as topic_names 
            , 'sentiment' as analysis
            , 'mc' as data_stream
        from {tablename(MCSentimentDayDomainAgg)} tti
        join {tablename(models.Country)} cou on tti.country_id = cou.country_code
        WHERE tti.date_id BETWEEN {start_date} AND {end_date}
        group by tti.country_id , tti.domain_id , cou.alpha_2 
            
        union all
           
        SELECT 
            top.domain_id as domain_id 
            , tti.country_id as country_id 
            , lower(cou.alpha_2) as alpha_2
            , (count(*) filter(where is_anomaly)) as value  
            , ARRAY_AGG(top.topic) FILTER (WHERE is_anomaly) AS topic_names
            , 'anomaly' as analysis
            , 'tg' as data_stream
        from {tablename(models.TopicIdDayAggTg)} tti
        join {tablename(models.Topic)} top on tti.topic_id = top.id
        join {tablename(models.Country)} cou on tti.country_id = cou.country_code
        WHERE tti.date_id BETWEEN {start_date} AND {end_date}
        group by tti.country_id , top.domain_id , cou.alpha_2 

        union all
           
        SELECT 
            top.domain_id as domain_id 
            , tti.country_id as country_id 
            , lower(cou.alpha_2) as alpha_2
            , (count(*) filter(where is_anomaly)) as value  
            , ARRAY_AGG(top.topic) FILTER (WHERE is_anomaly) AS topic_names 
            , 'anomaly' as analysis
            , 'mc' as data_stream
        from {tablename(models.MCTopicIdDayAgg)} tti
        join {tablename(models.Topic)} top on tti.topic_id = top.id
        join {tablename(models.Country)} cou on tti.country_id = cou.country_code
        WHERE tti.date_id BETWEEN {start_date} AND {end_date}
        group by tti.country_id , top.domain_id , cou.alpha_2 
    
    ;
    ''')
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def top_topics_in_period(pool, start_date, end_date, top_n=3, stream: str="tg"):
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    if stream == "tg":
        agg_model = models.TopicIdDayAggTg
    elif stream == "mc":
        agg_model = models.MCTopicIdDayAgg
    else:
        raise ValueError(f'Stream {stream} not allowed')
    
    q = (
        f'''
        WITH ranked_topics AS (
            SELECT
                am.country_id
                , am.topic_id
                , sum(am.topic_norm_prevalence)/{day_difference} AS avg_prevalence
                , ROW_NUMBER() OVER (PARTITION BY am.country_id ORDER BY AVG(am.topic_norm_prevalence) DESC) AS rank
            FROM {tablename(agg_model)} am
            WHERE date_id BETWEEN {start_date} and {end_date} 
            GROUP BY am.country_id, am.topic_id
        )

        SELECT
            country_id
            , lower(c.alpha_2) as alpha_2
            , topic_id
            , t.topic as topic_name
            , avg_prevalence as np
            , '{stream}' as stream
        FROM ranked_topics r
        join {tablename(models.Country)} c on r.country_id = c.country_code
        join {tablename(models.Topic)} t on t.id = r.topic_id
        WHERE rank <= {top_n};

    '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def top_topics_on_latest(pool, top_n=3, stream: str="tg"):
    """ this query gets results from the most recent date present in 
    topic aggregated table, but we should get them from tg_message or not
    aggregated ones

    """
    if stream == "tg":
        agg_model = models.TopicIdDayAggTg
    elif stream == "mc":
        agg_model = models.MCTopicIdDayAgg
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (f'''
    WITH row_numbers AS (
    SELECT row_number() OVER (
        PARTITION BY tti.country_id
        ORDER BY tti.topic_norm_prevalence desc
    )   AS row_num
        , tti.country_id AS country_id
        , lower(cou.alpha_2) as alpha_2
        , tti.topic_id AS topic_id
        , t.topic as topic
       	, tti.topic_norm_prevalence AS np
     	, tti.date_id
    
    FROM {tablename(agg_model)} AS tti
    join {tablename(models.Topic)} t on tti.topic_id = t.id
    join {tablename(models.Country)} cou on tti.country_id = cou.country_code
    join {tablename(models.DateRanges)} dr on 
        tti.country_id = dr.country_id and tti.date_id = dr.max_date_id and dr.stream = '{stream}'
    )
    
    SELECT 
        country_id
        , alpha_2
        , topic_id
        , date_id
        , np
        , '{stream}' as stream
    FROM row_numbers WHERE row_num <={top_n};

    '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def latest_sentiment_score(pool):
    """we should not order by date over partition but simply get
    sentiment value where date_id = max(date_id) of tg_message table for 
    every country (this is important, we can have different most recent 
    message for different countries)
    """
    q = (
        f'''
        with r as(
            select 
                dense_rank() over(
                    partition by ts.country_id
                    order by ts.date_id desc
                ) as r
                , ts.date_id
                , ts.country_id
                , ts.sentiment
            
            from {tablename(models.TgSentimentDayDomainAgg)} ts
        )

            select country_id, date_id, avg(sentiment) as sentiment 
            from r where r.r = 1
            group by country_id, date_id
        ;
  
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result



async def latest_sentiment_with_delta_for_period(pool, start_date, end_date, stream):
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    prev_start_date = int((date1 - dt.timedelta(days=day_difference)).strftime("%Y%m%d"))
    prev_end_date = start_date

    if stream == "tg":
        agg_model = models.TgSentimentDayDomainAgg
    elif stream == "mc":
        agg_model = models.MCSentimentDayDomainAgg
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        with prev_r as (
            SELECT 
                tti.domain_id as domain_id 
                , tti.country_id as country_id 
                , lower(cou.alpha_2) as alpha_2
                , cou.name as country
                , avg(tti.sentiment) as sentiment  
            from {tablename(agg_model)} tti
            join {tablename(models.Country)} cou on tti.country_id = cou.country_code
            WHERE tti.date_id BETWEEN {prev_start_date} AND {prev_end_date}
            group by tti.country_id , tti.domain_id , cou.alpha_2, cou.name
        )
            SELECT 
                tti.domain_id
                , tti.country_id as country_id 
                , p.alpha_2 as alpha_2
                , p.country as country
                , avg(tti.sentiment) as sentiment 
                , avg(tti.sentiment) - avg(p.sentiment) as delta
                , '{stream}' as stream
            from {tablename(agg_model)} tti
            join prev_r p on p.country_id = tti.country_id and p.domain_id = tti.domain_id
            WHERE tti.date_id BETWEEN {start_date} AND {end_date}
            group by tti.country_id , tti.domain_id, p.alpha_2, p.country
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def latest_sentiment_with_delta(pool, stream: str="tg"):
    if stream == "tg":
        agg_model = models.TgSentimentDayDomainAgg
    elif stream == "mc":
        agg_model = models.MCSentimentDayDomainAgg
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        with prev_r as (
            select 
                date_id
                , country_id
                , cou.name as country
                , lower(cou.alpha_2) as alpha_2
                , domain_id
                , sentiment
                , lag(sentiment) over (
                    partition by country_id , domain_id 
                    order by date_id 
                    
                ) as prev
                
            from {tablename(agg_model)} ts
            join {tablename(models.Country)} cou on ts.country_id = cou.country_code
        )
            select 
                date_id
                , p.country_id
                , alpha_2
                , country
                , avg(sentiment) sentiment
                , (avg(sentiment) - avg(prev)) as delta
                , '{stream}' as stream
            from prev_r p
            join {tablename(models.DateRanges)} dr on
                 p.country_id = dr.country_id and p.date_id = dr.max_date_id and dr.stream = '{stream}'
            group by p.country_id, p.date_id, p.country, p.alpha_2
            order by date_id desc

        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def domain_ranking_in_period(
    pool, 
    country_id: int, 
    start_date: int,
    end_date: int,
    stream: str
):
    if stream == "tg":
        agg_model = models.TgTopicIdPositive
        count_model = models.TgDailyCounts
    elif stream == "mc":
        agg_model = models.MCTopicIdPositive
        count_model = models.MCDailyCounts
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
         WITH total_count AS (
            SELECT
                SUM(cm.count) AS total_count
            FROM {tablename(count_model)} cm
            WHERE
                cm.country_id = {country_id}
                AND cm.date_id BETWEEN {start_date} AND {end_date}
        )
        select 
            sum(1)::float/(SELECT total_count FROM total_count) as frequency
            , domain_id
            , dom.name as domain
        from {tablename(agg_model)} tticda 
        join {tablename(count_model)} cm on tticda.country_id = cm.country_id and tticda.date_id = cm.date_id
        join {tablename(models.Topic)} t on tticda.topic_unique_id = t.id
        join {tablename(models.Domain)} dom on t.domain_id = dom.id
        where
            tticda.country_id = {country_id}
            and (tticda.date_id >= {start_date} and tticda.date_id <= {end_date})
        group by t.domain_id, dom.name
        order by frequency desc;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def latest_updates_by_country(pool):
    q = (
        f'''
        select 
            lu.country_id as country_id
            , lu.date_id as date_id
            , 'tg' as data_stream
        from {tablename(models.TgLatestUpdates)} lu

        union all

        select 
            lu.country_id as country_id
            , lu.date_id as date_id
            , 'mc' as data_stream
        from {tablename(models.MCLatestUpdates)} lu;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def get_country_codes(pool):
    q = (
        f'''
        select
            c.country_code as country_id
            , c.name as name
            , c.alpha_2 as alpha_2
        from {tablename(models.Country)} c;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def topic_rankings_by_domain_in_period(
    pool, country_id: int, start_date: int, end_date: int
):
    q = (
        f'''
        select 
            sum(topic_count)::float/sum(msg_count) as frequency
            , topic_id as topic_id
            , t.domain_id as domain_id
        from {tablename(models.TgTopicIdCountDayAgg)} tticda 
        join {tablename(models.Date)} d on tticda.date_id = d.id
        join {tablename(models.Topic)} t on tticda.topic_id = t.id 
        where
            tticda.country_id = {country_id} and
            (d.id >= {start_date} and d.id <= {end_date})
        group by tticda.topic_id, t.domain_id 
        order by domain_id, frequency desc
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def tg_talking_points_data(pool, country_id: int, start_date: int, end_date: int):
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1

    q = (
        f'''
        select 
            tsdda.domain_id 
            , d.name as domain
            , avg(tsdda.sentiment) as avg_value
            , 'sentiment' as layer
        from {tablename(models.TgSentimentDayDomainAgg)} tsdda 
        join {tablename(models.Domain)} d on tsdda.domain_id = d.id
        where 
            tsdda.date_id >= {start_date} and tsdda.date_id <= {end_date}
            and tsdda.country_id = {country_id}
        group by tsdda.domain_id, d.name
        
        
        union all

        select 
            tsdda.domain_id 
            , d.name as domain
            , sum(tsdda.topic_norm_prevalence)/{day_difference} as avg_value
            , 'attention' as layer
        from {tablename(models.TopicIdDayDomainAggTg)} tsdda 
        join {tablename(models.Domain)} d on tsdda.domain_id = d.id
        where 
            tsdda.date_id >= {start_date} and tsdda.date_id <= {end_date}
            and tsdda.country_id = {country_id}
        group by tsdda.domain_id, d.name
        

        order by layer, avg_value desc
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def tg_talking_points_with_delta(pool, country_id: int, start_date: int, end_date: int):
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    prev_start_date = int((date1 - dt.timedelta(days=day_difference)).strftime("%Y%m%d"))
    prev_end_date = start_date

    q = (
        f'''
        with st_prev_values 
        as (
            select 
                ts.domain_id
                , avg(sentiment) as prev_value
            from {tablename(models.TgSentimentDayDomainAgg)} ts
            where  
                ts.date_id >= {prev_start_date} and ts.date_id <= {prev_end_date}
                and ts.country_id = {country_id}
            group by ts.domain_id
        ),
        ti_prev_values 
        as (
            select 
                ts.domain_id
                , sum(ts.topic_norm_prevalence)/{day_difference} as prev_value
            from {tablename(models.TopicIdDayDomainAggTg)} ts
            where  
                ts.date_id >= {prev_start_date} and ts.date_id <= {prev_end_date}
                and ts.country_id = {country_id}
            group by ts.domain_id
        )
        select 
            ts.domain_id as domain_id
            , d.name as domain
            , 'sentiment' as layer
            , avg(sentiment) as latest_value
            , st_prev_values.prev_value as prev_value
            
        from {tablename(models.TgSentimentDayDomainAgg)} ts
        join {tablename(models.Domain)} d on ts.domain_id = d.id
        left join st_prev_values on ts.domain_id = st_prev_values.domain_id
        where 
            ts.date_id >= {start_date} and ts.date_id <= {end_date}
            and ts.country_id = {country_id}
        group by ts.domain_id, d.name, st_prev_values.prev_value
        

        union all


        
        select 
            ts.domain_id as domain_id
            , d.name as domain
            , 'attention' as layer
            , sum(ts.topic_norm_prevalence)/{day_difference} as latest_value
            , coalesce(ti_prev_values.prev_value, 0) as prev_value
            
        from {tablename(models.TopicIdDayDomainAggTg)} ts
        join {tablename(models.Domain)} d on ts.domain_id = d.id
        left join ti_prev_values on ts.domain_id = ti_prev_values.domain_id
        where 
            ts.date_id >= {start_date} and ts.date_id <= {end_date}
            and ts.country_id = {country_id}
        group by ts.domain_id, d.name, ti_prev_values.prev_value

        
        order by layer, latest_value
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def mc_talking_points_with_delta(pool, country_id: int, start_date: int, end_date: int):
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    prev_start_date = int((date1 - dt.timedelta(days=day_difference)).strftime("%Y%m%d"))
    prev_end_date = start_date

    q = (
        f'''
        with st_prev_values 
        as (
            select 
                ts.domain_id
                , avg(sentiment) as prev_value
            from {tablename(models.MCSentimentDayDomainAgg)} ts
            where  
                ts.date_id >= {prev_start_date} and ts.date_id <= {prev_end_date}
                and ts.country_id = {country_id}
            group by ts.domain_id
        ),
        ti_prev_values 
        as (
            select 
                ts.domain_id
                , sum(ts.topic_norm_prevalence)/{day_difference} as prev_value
            from {tablename(models.MCTopicIdDayDomainAgg)} ts
            where  
                ts.date_id >= {prev_start_date} and ts.date_id <= {prev_end_date}
                and ts.country_id = {country_id}
            group by ts.domain_id
        )
        select 
            ts.domain_id as domain_id
            , d.name as domain
            , 'sentiment' as layer
            , avg(sentiment) as latest_value
            , st_prev_values.prev_value as prev_value
            
        from {tablename(models.MCSentimentDayDomainAgg)} ts
        join {tablename(models.Domain)} d on ts.domain_id = d.id
        left join st_prev_values on ts.domain_id = st_prev_values.domain_id
        where 
            ts.date_id >= {start_date} and ts.date_id <= {end_date}
            and ts.country_id = {country_id}
        group by ts.domain_id, d.name, st_prev_values.prev_value
        

        union all


        
        select 
            ts.domain_id as domain_id
            , d.name as domain
            , 'attention' as layer
            , sum(ts.topic_norm_prevalence)/{day_difference} as latest_value
            , coalesce(ti_prev_values.prev_value, 0) as prev_value
            
        from {tablename(models.MCTopicIdDayDomainAgg)} ts
        join {tablename(models.Domain)} d on ts.domain_id = d.id
        left join ti_prev_values on ts.domain_id = ti_prev_values.domain_id
        where 
            ts.date_id >= {start_date} and ts.date_id <= {end_date}
            and ts.country_id = {country_id}
        group by ts.domain_id, d.name, ti_prev_values.prev_value

        
        order by layer, latest_value
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def tg_domain_prevalences_in_period_for_country(
    pool, country_id: int, start_date: int, end_date: int
): 
    # concat(d.date_actual::text, 'T00:00:00') as date
    q = (
        f'''
        select 
            d.date_actual as date
            , d2.name as domain
            , topic_norm_prevalence as value
        from {tablename(models.TopicIdDayDomainAggTg)} tiddat 
        join {tablename(models.Date)} d on tiddat.date_id = d.id
        join {tablename(models.Domain)} d2 on tiddat.domain_id = d2.id
        where 
            tiddat.country_id = {country_id}
            and tiddat.date_id >= {start_date} and tiddat.date_id <= {end_date}
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def mc_domain_prevalences_in_period_for_country(
    pool, country_id: int, start_date: int, end_date: int
): 
    # concat(d.date_actual::text, 'T00:00:00') as date
    q = (
        f'''
        select 
            d.date_actual as date
            , d2.name as domain
            , topic_norm_prevalence as value
        from {tablename(models.MCTopicIdDayDomainAgg)} tiddat 
        join {tablename(models.Date)} d on tiddat.date_id = d.id
        join {tablename(models.Domain)} d2 on tiddat.domain_id = d2.id
        where 
            tiddat.country_id = {country_id}
            and tiddat.date_id >= {start_date} and tiddat.date_id <= {end_date}
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def domain_prevalences_in_period_for_country(
    pool, country_id: int, start_date: int, end_date: int, stream: str="tg", conditions = None
): 
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    # concat(d.date_actual::text, 'T00:00:00') as date
    if stream == "tg":
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_col_name = "message_unique_id"
        daily_count_model = models.TgDailyCounts
    elif stream == "mc":
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_col_name = "story_id"
        daily_count_model = models.MCDailyCounts
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        select 
            d.date_actual as date
            , d2.name as domain
            -- , avg(topic_norm_prevalence) as value
            , sum(ttip.topic_norm_prevalence)/tdc.count  AS value
        from {tablename(topic_model)} ttip
        join {tablename(sentiment_model)} ts on ttip.{record_col_name} = ts.{record_col_name}
            and (ttip.country_id = ts.country_id)
        join {tablename(daily_count_model)} tdc on 
            tdc.date_id = ttip.date_id and tdc.country_id = ttip.country_id
        join {tablename(models.Date)} d on ttip.date_id = d.id
        join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
        join {tablename(models.Domain)} d2 on t.domain_id = d2.id
        where 
            ttip.country_id = {country_id}
            and ttip.date_id between {start_date} and {end_date}
            {topic_clause} 
            {sentiment_clause} 
            {emotion_clause} 
        
        group by ttip.country_id, d.date_actual, d2.name, tdc.count
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def get_domains(pool):
    q = (
        f'''
        select
            d.id as domain_id
            , d.name as domain
        from {tablename(models.Domain)} d;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def date_ranges_overall(pool, streams: Iterable[str]):
    if not streams:
        raise ValueError("Insert at least one stream into the 'streams' iterable")
    streams_str = ", ".join([f"'{x}'" for x in streams])
    stream_clause = f"({streams_str})"
    q = (
        f'''
        select
            min(min_date_id) as min_date
            , max(max_date_id) as max_date
        from {tablename(models.DateRanges)} dr
        where dr.stream in {stream_clause}
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def date_ranges_for_all_countries(pool):
    q = (
        f'''
        select
            *
        from {models.DateRanges};
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def date_ranges_for_country(pool, country_id: int):
    q = (
        f'''
        select 
            *
        from {tablename(models.DateRanges)} dr
        where dr.country_id = {country_id};
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def mc_entity_in_period_for_country(
    pool, country_id: int, start_date: int, end_date: int, entity: str, limit: int
):
    if entity == "bigram":
        model = models.MCBigramsDayAgg
    elif entity == "trigram":
        model = models.MCTrigramsDayAgg
    elif entity == "location":
        model = models.MCLocationsDayAgg
    elif entity == "person":
        model = models.MCPersonsDayAgg
    elif entity == "org":
        model = models.MCOrgsDayAgg
    if entity in ["location", "person", "org"]:
        entity_id = entity + "_name"
    else: 
        entity_id = entity
    limit_clause = f' limit {limit}' if limit is not None else ''
    q = (
        f'''
        select 
            mb.{entity_id} as {entity}
            , avg({entity}_percent) as value
        from {tablename(model)} mb
        where 
            mb.date_id >= {start_date} and mb.date_id <= {end_date}
            and mb.country_id = {country_id}
        group by mb.country_id, mb.{entity_id} 
        order by avg({entity}_percent) desc
        {limit_clause}
        ;

        '''
        )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def ssi_w_series(
    pool, country_id: int, start_date: int, end_date: int, ssi_domain_id = 3
):  
    try:
        ssi_domain_id = int(ssi_domain_id)
        domains_clause = f' sda.ssi_domain_id = {ssi_domain_id} '
    except Exception:
        domains = [str(x) for x in json.loads(ssi_domain_id)]
        domains_clause = f' sda.ssi_domain_id in ({", ".join(domains)})'
    q = (
        f'''
        select
            d.date_actual as date
            , sda.value as ssi_w
            , dom.domain as domain
        from {tablename(models.SSIDayAgg)} sda
        join {tablename(models.Date)} d on sda.date_id = d.id
        join {tablename(models.SSIDomain)} dom on sda.ssi_domain_id = dom.id
        where 
            sda.date_id >= {start_date} and sda.date_id <= {end_date}
            and sda.country_id = {country_id}
            and {domains_clause}
            and sda.is_ssi_w = TRUE
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def ssi_fields_series(
    pool, country_id: int, start_date: int, end_date: int, ssi_domain_id: int = 3
):
    q = (
        f'''
        select
            d.date_actual as date
            , sda.value as value
            , sf.field as field
        from {tablename(models.SSIDayAgg)} sda
        join {tablename(models.Date)} d on sda.date_id = d.id
        join {tablename(models.SSIField)} sf on sda.ssi_field_id = sf.id
        join {tablename(models.SSIDomain)} sd on sda.ssi_domain_id = sd.id
        where 
            sda.date_id >= {start_date} and sda.date_id <= {end_date}
            and sda.country_id = {country_id}
            and sda.ssi_domain_id = {ssi_domain_id}
            and sda.is_ssi_w = FALSE
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def tg_messages_no_duplicates(
    pool,  
    alpha_2: str, 
    start_date: int, 
    end_date: int,
    sorted_by: str="date", 
    limit: int=10, 
    conditions=None, 
    offset: int=10,
):
    
    model = models.TgMessageCountry[alpha_2]
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    sorted_by = sorted_by.strip().lower()
    if sorted_by not in ["date", "sentiment"]:
        sorted_by = "date"
    if sorted_by == "date":
        col = "ms.timestamp"
    elif sorted_by == "sentiment":
        col = "ts.sentiment"

    
    # start_date = parse(str(start_date)).strftime('%Y-%m-%d')
    # end_date = parse(str(end_date)).strftime('%Y-%m-%d')
    
    q = (
        f'''
            select 
                distinct 
                ms.unique_id as unique_id
                , ms.username as username
                , ms.author_username as author_username
                , ms.message_id as message_id
                , ms.timestamp as timestamp
                , case
                    when lower(tc.language) = 'english' then ms.body
                    else ms.body_en
                end as body
                , array_agg(t.topic) AS detected_topics
            from {tablename(models.TgTopicIdPositive)} ttip 
            join {tablename(models.TgSentiment)} ts on ttip.message_unique_id  = ts.message_unique_id
                and (ttip.country_id = ts.country_id)
            join {tablename(model)} ms on ttip.message_unique_id = ms.unique_id 
                and (ms.country_id = ttip.country_id)
            join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id
            join {tablename(models.TgChannel)} tc on ms.channel_id = tc.channel_id
            where 
                ttip.date_id  BETWEEN {start_date} and {end_date}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            group by ms.unique_id, ms.author_username, ms.username, ms.message_id, ms.timestamp, ms.body, tc.language
            order by {col} desc 
        limit {limit}
        offset {offset}
        ;

        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def tg_messages(
    pool, country_id: int, start_date: int, end_date: int, sorted_by: str="date", limit: int=10, conditions=None
):
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    
    sorted_by = sorted_by.strip().lower()
    if sorted_by not in ["date", "sentiment"]:
        sorted_by = "date"
    if sorted_by == "date":
        col = "ms.timestamp"
    elif sorted_by == "sentiment":
        col = "ts.sentiment"

    
    start_date = parse(str(start_date)).strftime('%Y-%m-%d')
    end_date = parse(str(end_date)).strftime('%Y-%m-%d')
    
    q = (
        f'''
        select 
            ms.unique_id
            , ms.message_id as message_id
            , ms.username as username
            , ms.timestamp as timestamp
            , ms.body as body
        from {tablename(models.TgTopicIdPositive)} ttip 
        join {tablename(models.TgMessage)} ms on ttip.message_unique_id = ms.unique_id
        join {tablename(models.TgSentiment)} ts on ttip.message_unique_id  = ts.message_unique_id
         
        where 
            ms.country_id = {country_id} and 
            ms.timestamp::DATE  BETWEEN '{start_date}' and '{end_date}' 
            {topic_clause}
            {sentiment_clause}
            {emotion_clause}
        order by {col} desc 
        limit {limit}
        ;

        '''
    )
   
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


def generate_sql(conditions, start_date, end_date):
    nested_dicts = lambda: defaultdict(nested_dicts)
    in_clause, notin_clause = "", ""
    topic_table = tablename(models.TgTopicIdPositive)

    b = nested_dicts()
    for cond in conditions:
        
        op = b[cond["field"]][cond["operator"]]
        if not op:
            b[cond["field"]][cond["operator"]] = [cond["value"]]
            
        else:
            b[cond["field"]][cond["operator"]].append(cond["value"])
    q = (
        f'''
        -- Define the topic_ids you want to include
        WITH included_messages AS (
            SELECT message_unique_id
            FROM {topic_table} ttip
            join {tablename(models.TgMessage)} tm on tm.unique_id = message_unique_id 
            join {tablename(models.Date)} d on ttip.date_id = d.id
            WHERE 
                1 = 1
                and d.id >= {start_date} and d.id <= {end_date}
                {in_clause} -- Replace these values with your specific included topic_id values
            GROUP BY message_unique_id
            HAVING COUNT(DISTINCT topic_unique_id) = 2 -- Ensure the count matches the number of included topic_id values
        ),

        -- Define the topic_ids you want to exclude
        excluded_messages AS (
            SELECT message_unique_id
            FROM {topic_table} ttip
            join {tablename(models.TgMessage)} tm on tm.unique_id = message_unique_id 
            join {tablename(models.Date)} d on tm.timestamp::DATE = d.date_actual
            WHERE 
                1 = 1 
                and d.id >= {start_date} and d.id <= {end_date}
                {notin_clause} -- Replace these values with your specific excluded topic_id values
        )

        SELECT message_unique_id
        FROM included_messages
        WHERE NOT EXISTS (
            SELECT 1
            FROM excluded_messages e
            WHERE included_messages.message_unique_id = e.message_unique_id
        );
            '''
    )
    return q


async def mc_stories_no_duplicates(
    pool, country_id: int, start_date: int, end_date: int, sorted_by: str="date", limit: int=10, conditions=None):
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    sorted_by = sorted_by.strip().lower()
    if sorted_by not in ["date", "sentiment"]:
        sorted_by = "date"
    if sorted_by == "date":
        col = "ms.publish_date"
    elif sorted_by == "sentiment":
        col = "ts.sentiment"
    start_date = parse(str(start_date)).strftime('%Y-%m-%d')
    end_date = parse(str(end_date)).strftime('%Y-%m-%d')
    q = (
        f'''
        select 
            sub.username,
            sub.url,
            sub.timestamp,
            sub.body
        from (
            select distinct on (ms.id)
                ms.media_name as username
                , ms.url as url
                , ms.publish_date as timestamp
                , ms.title as body
            from {tablename(models.MCSentiment)} ts 
            join {tablename(models.MCTopicIdPositive)} ttip on ts.story_id = ttip.story_id
                and (ttip.country_id = ts.country_id)
            join {tablename(models.MCStory)} ms on ms.id = ts.story_id
            where 
                ms.country_id = {country_id} and 
                ms.publish_date::DATE between '{start_date}' and '{end_date}' 
            {topic_clause} 
            {sentiment_clause} 
            {emotion_clause} 
            order by ms.id, {col} desc
            
        ) sub 
        order by sub.timestamp desc
        limit {limit};
        '''
    )
    
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


def generate_filter_clauses(conditions, topic_table_alias="ttip", sent_table_alias="ts", topic_col='topic_unique_id'):
    nested_dicts = lambda: defaultdict(nested_dicts)
    topic_clause, notin_clause, sentiment_clause, emotion_clause = "", "", "", ""
    if not conditions:
        return "", "", ""

    b = nested_dicts()
    for cond in conditions:
        op = b[cond["field"]][cond["operator"]]
        if not op:
            b[cond["field"]][cond["operator"]] = [cond["value"]]
            
        else:
            b[cond["field"]][cond["operator"]].append(cond["value"])
    if b["Topic"].get("IS"):
        topic_clause = f' AND ({" OR ".join(f"{topic_table_alias}.{topic_col} = {f} " for f in b["Topic"]["IS"])})'
    if b["Sentiment"].get("IS") or b["Sentiment"].get("IS NOT"):
        sentiment_sub_conds = []
        for key, values in b["Sentiment"].items():
            for v in values:
                if v.lower() == "negative" and key.lower() == "is":
                    sentiment_sub_conds.append(f' {sent_table_alias}.sentiment < 0')
                if v.lower() == "negative" and key.lower() == "is not":
                    sentiment_sub_conds.append(f' {sent_table_alias}.sentiment >= 0 ')
                if v.lower() == "positive" and key.lower() == "is":
                    sentiment_sub_conds.append(f' {sent_table_alias}.sentiment > 0 ')
                if v.lower() == "positive" and key.lower() == "is not":
                    sentiment_sub_conds.append(f' {sent_table_alias}.sentiment <= 0 ')
        sentiment_clause = f' AND ({" AND ".join(sentiment_sub_conds)})'
        
    if b["Emotion"].get("IS") or b["Emotion"].get("IS NOT"):
        emotion_clause = (
            f'''
             AND (
                {" AND ".join(
                    f"{sent_table_alias}.{v} {(' > 0', ' = 0 ')[key == 'IS NOT']} " 
                    for key, values in b["Emotion"].items()
                    for v in values
                )}
             )
            '''
        )
    return (topic_clause, sentiment_clause, emotion_clause)


async def mc_stories(
    pool, 
    alpha_2: str,
    start_date: int, end_date: int, 
    sorted_by: str="date", 
    limit: int=10, 
    conditions=None, 
    offset: int = 0,
):
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    sorted_by = sorted_by.strip().lower()
    if sorted_by not in ["date", "sentiment"]:
        sorted_by = "date"
    if sorted_by == "date":
        col = "ms.publish_date"
    elif sorted_by == "sentiment":
        col = "ts.sentiment"
    start_date = parse(str(start_date)).strftime('%Y-%m-%d')
    end_date = parse(str(end_date)).strftime('%Y-%m-%d')
    q = (
        f'''
        select 
            distinct
            ms.id
            , ms.media_name as username
            , ms.url as url
            , ms.publish_date as timestamp
            , ms.indexed_date
            , case
                    when lower(ms.language) = 'en' then ms.title
                    else ms.body_en
            end as body
            , array_agg(t.topic) AS detected_topics
        from {tablename(models.MCSentiment)} ts 
        join {tablename(models.MCTopicIdPositive)} ttip on ts.story_id = ttip.story_id
            and (ttip.country_id = ts.country_id)
        join {tablename(models.MCStoryCountry[alpha_2])} ms on ms.id = ts.story_id
            and (ttip.country_id = ms.country_id)
        join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id
        where 
            ms.publish_date::DATE between '{start_date}' and '{end_date}' 
           {topic_clause} 
           {sentiment_clause} 
           {emotion_clause} 
        group by ms.id, ms.media_name, ms.url, ms.publish_date, ms.title
        order by {col} desc, ms.indexed_date desc
        offset {offset}
        limit {limit}
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


def generate_filters_sql(conditions, start_date, end_date, country_id):
    nested_dicts = lambda: defaultdict(nested_dicts)
    topic_clause, notin_clause, sentiment_clause, emotion_clause = "", "", "", ""
    topic_table = tablename(models.TgTopicIdPositive)

    b = nested_dicts()
    for cond in conditions:
        op = b[cond["field"]][cond["operator"]]
        if not op:
            b[cond["field"]][cond["operator"]] = [cond["value"]]
            
        else:
            b[cond["field"]][cond["operator"]].append(cond["value"])
    if b["Topic"].get("IS"):
        topic_clause = f' AND ({" OR ".join(f"ttip.topic_unique_id = {f} " for f in b["Topic"]["IS"])})'
    if b["Sentiment"].get("IS") or b["Sentiment"].get("IS NOT"):
        sentiment_clause = (
            f'''
             AND (
                {" AND ".join(
                    f"ts.{v} {(' > 0', ' = 0 ')[key == 'IS NOT']} " 
                    for key, values in b["Sentiment"].items()
                    for v in values
                )}
             )
            '''
        )
    if b["Emotion"].get("IS") or b["Emotion"].get("IS NOT"):
        emotion_clause = (
            f'''
             AND (
                {" AND ".join(
                    f"ts.{v} {(' > 0', ' = 0 ')[key == 'IS NOT']} " 
                    for key, values in b["Emotion"].items()
                    for v in values
                )}
             )
            '''
        )

    q = (
        f'''
            SELECT distinct ttip.message_unique_id as message_unique_id
            FROM {topic_table} ttip
            join {tablename(models.TgMessage)} tm on tm.unique_id = ttip.message_unique_id 
            join {tablename(models.TgChannel)} tc on tm.channel_id = tc.channel_id
            join {tablename(models.TgSentiment)} ts on ts.message_unique_id = ttip.message_unique_id
            join {tablename(models.Date)} d on tm.timestamp::DATE = d.date_actual
            join {tablename(models.Country)} c on lower(tc.country) = lower(c.name)
            WHERE 
                1 = 1
                and (d.id >= {start_date} and d.id <= {end_date}) 
                and c.country_code = {country_id}
                {topic_clause} 
                {sentiment_clause}
                {emotion_clause}
        ;
            '''
    )
    return q


async def get_filtered_message_ids(pool, conditions, start_date, end_date, country_id):
    q = generate_filters_sql(conditions, start_date, end_date, country_id)
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def time_series_from_filtered_messages(
        pool, conditions, country_id, start_date, end_date, stream="tg"
    ):
    """
    This function must be used only if topics are present in conditions, i.e. the variable topic_clause
    is not an empty string

    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    if stream == "tg":
        topic_table = models.TgTopicIdPositive
        sentiment_table = models.TgSentiment
        record_col_name = "message_unique_id"
        daily_counts_table = models.TgDailyCounts
    elif stream == "mc":
        topic_table = models.MCTopicIdPositive
        sentiment_table = models.MCSentiment
        record_col_name = "story_id"
        daily_counts_table = models.MCDailyCounts
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        
            select
                ttip.date_id as date_id
                , sum(ttip.topic_norm_prevalence)/tdc.count as value
                , t.topic as topic
            from {tablename(topic_table)} ttip
            join {tablename(sentiment_table)} ts on ttip.{record_col_name} = ts.{record_col_name}
                and (ttip.country_id = ts.country_id)
            join {tablename(daily_counts_table)} tdc on 
                tdc.date_id = ttip.date_id and tdc.country_id = ttip.country_id
            join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            group by ttip.country_id, ttip.date_id, t.topic, tdc.count
            ;
        '''
    )

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    


async def hot_topics_with_topic_condition(pool, conditions, country_id, start_date, end_date, stream):
    """
    This function must be used only if topics are present in conditions, i.e. the variable topic_clause
    is not an empty string.
    It does an avereage prevalence for each topic selected within country and period and other conditions

    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    if stream == "tg":
        count_model = models.TgDailyCounts
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_id_name = "message_unique_id"
    elif stream == "mc":
        count_model = models.MCDailyCounts
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_id_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        WITH total_count AS (
            SELECT
                SUM(cm.count) AS total_count
            FROM {tablename(count_model)} cm
            WHERE
                cm.country_id = {country_id}
                AND cm.date_id BETWEEN {start_date} AND {end_date}
        )
            select
                sum(1)::float/(SELECT total_count FROM total_count) as frequency
                , t.topic as topic
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
                and (ts.country_id = ttip.country_id)
            join {tablename(models.Topic)} as t on ttip.topic_unique_id = t.id
            
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            group by t.topic
            order by frequency desc
            ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result 


async def hot_topics_without_topic_condition(
    pool, conditions, country_id, start_date, end_date, stream):
    """
    This function must be used only if topics are NOT present in conditions, i.e. the variable topic_clause
    IS AN EMPTY STRING.
    It produces the same output of domain_ranking_in_period but against conditions on sentiment and/or emotions

    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    if stream == "tg":
        count_model = models.TgDailyCounts
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_id_name = "message_unique_id"
    elif stream == "mc":
        count_model = models.MCDailyCounts
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_id_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        WITH total_count AS (
            SELECT
                SUM(cm.count) AS total_count
            FROM {tablename(count_model)} cm
            WHERE
                cm.country_id = {country_id}
                AND cm.date_id BETWEEN {start_date} AND {end_date}
        )
            select
                sum(1)::float/(SELECT total_count FROM total_count) as frequency
                , domain_id
                , dom.name as domain

                
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
                and (ttip.country_id = ts.country_id)
            join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
            join {tablename(models.Domain)} dom on t.domain_id = dom.id 
            
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            group by dom.name, domain_id
            order by frequency desc
            ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result 



async def talking_points_on_conditions_bkp(pool, conditions, country_id, start_date, end_date):
    """
    This function can be used on any kind of conditions (topic, sentiment, emotion)
    It does an avereage prevalence for each domain of the framekork within country and period and other conditions

    the version with the first two with clauses (msg_count_in_latest_period, msg_count_in_prev_previous) has 
    never been tested. Search on previous commits for tested one
    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    prev_start_date = int((date1 - dt.timedelta(days=day_difference)).strftime("%Y%m%d"))
    prev_end_date = start_date
    

    q = (
        f'''
        with msg_count_in_latest_period as (
            select sum(dcounts.msg_count) as value
            from (
                select 
                    distinct cda.date_id, cda.msg_count as msg_count
                from {tablename(models.TgTopicIdCountDayAgg)} as cda
                where 
                    cda.country_id = {country_id}
                    and (cda.date_id >= {start_date} and cda.date_id <= {end_date})
            ) as lcounts
            
        ),
        msg_count_in_prev_period as (
            select sum(dcounts.msg_count) as value
            from (
                select 
                    distinct cda.date_id, cda.msg_count as msg_count
                from {tablename(models.TgTopicIdCountDayAgg)} as cda
                where 
                    cda.country_id = {country_id}
                    and (cda.date_id >= {prev_start_date} and cda.date_id <= {prev_end_date})
            ) as pcounts
            
        ),
        prev_values 
        as (
            select 
                t.domain_id as domain_id
                , sum(ttip.topic_norm_prevalence)/pcounts.msg_count as prev_attention
                , avg(sentiment) as prev_sentiment
            from {tablename(models.TgTopicIdPositive)} ttip
            join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
             and (ttip.country_id = ts.country_id)
            join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
            join pcounts on true
            
            where  
                (ttip.date_id >= {prev_start_date} and ttip.date_id <= {prev_end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause} 
                {sentiment_clause}
                {emotion_clause}
            group by t.domain_id
        )

        select 
            t.domain_id
            , avg(ts.sentiment) as latest_sentiment
            , sum(ttip.topic_norm_prevalence)/lcounts.msg_count as latest_attention
            , prev_values.prev_attention as prev_attention
            , prev_values.prev_sentiment as prev_sentiment
        
        from {tablename(models.TgTopicIdPositive)} ttip
        join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
            and (ttip.country_id = ts.country_id)
        join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
        join lcounts on true
        left join prev_values on t.domain_id = prev_values.domain_id 

        where  
            (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
            and ttip.country_id = {country_id}
            {topic_clause} 
            {sentiment_clause}
            {emotion_clause}
        group by t.domain_id, prev_values.prev_attention, prev_values.prev_sentiment

        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def talking_points_on_conditions(pool, conditions, country_id, start_date, end_date, stream):
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    if stream == "tg":
        count_model = models.TgDailyCounts
        count_col_name = "count"
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_id_name = "message_unique_id"
    elif stream == "mc":
        count_model = models.MCDailyCounts
        count_col_name = "count"
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_id_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')        
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    prev_start_date = int((date1 - dt.timedelta(days=day_difference)).strftime("%Y%m%d"))
    prev_end_date = start_date

    q = (
        f'''
        with latest_count as (
            select sum(lcounts.msg_count) as value
            from (
                select 
                    distinct cda.date_id, cda.{count_col_name} as msg_count
                from {tablename(count_model)} as cda
                where 
                    cda.country_id = {country_id}
                    and (cda.date_id >= {start_date} and cda.date_id <= {end_date})
            ) as lcounts
            
        ),
        prev_count as (
            select sum(pcounts.msg_count) as value
            from (
                select 
                    distinct cda.date_id, cda.{count_col_name} as msg_count
                from {tablename(count_model)} as cda
                where 
                    cda.country_id = {country_id}
                    and (cda.date_id >= {prev_start_date} and cda.date_id <= {prev_end_date})
            ) as pcounts
            
        ),
        filt_prev_msg as (
            select 
                ttip.{record_id_name}
                ,'prev' as _type
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
                and ttip.country_id = ts.country_id
            where  
                ttip.date_id between {prev_start_date} and {prev_end_date}
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause} 
                {emotion_clause}
                    
        ),	
        filt_latest_msg as (
            select 
                ttip.{record_id_name}
                , 'latest' as _type
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
                and ttip.country_id = ts.country_id
            where  
                ttip.date_id between {start_date} and {end_date}
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause} 
                {emotion_clause}

        ), 
        tot_messages as (
            select 
                *
            from filt_prev_msg
            
            union
            
            select 	
                *
            from filt_latest_msg
        )

	
            select 
                sum(topic_norm_prevalence)/
                case 
                    when l._type = 'prev' then prev_count.value
                    when l._type = 'latest' then latest_count.value
                    else 1  -- default
                end as attention
                , avg(sentiment) as sentiment
                , t.domain_id as domain_id
                , d.name as domain
                , _type as type
            from tot_messages l
            join  {tablename(topic_model)} ttip on l.{record_id_name} = ttip.{record_id_name}
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
                and ttip.country_id = ts.country_id
            join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id
            join {tablename(models.Domain)} d on t.domain_id = d.id
            join latest_count on true
            join prev_count on true
            
            group by t.domain_id, d.name, l._type, prev_count.value, latest_count.value
            ;
                '''
        )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result        


async def tfidf_top_terms(pool, alpha_2: str, start_date: int, end_date: int, stream: str="tg", limit: int=50):
    if stream == "tg":
        model = models.TFIDF[alpha_2]
    elif stream == "mc":
        pass
    else:
        raise ValueError(f'Stream {stream} not allowed')
    date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
    date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
    day_difference = (date2 - date1).days + 1
    q = (
        f"""
        select 	
            tz.lemma as lemma
            , sum(tz.tfidf)/{day_difference} as mean_value
        from {tablename(model)} tz 
        where 
           tz.date_Id between {start_date} and {end_date}
        group by tz.lemma 
        order by avg(tz.tfidf) desc 
        limit {limit}
        """
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    


async def tfidf_day_agg_top_terms(
        pool, alpha_2: str, start_date: int, end_date: int, stream: str="tg", limit: int=50):
    if stream == "tg":
        model = models.TFIDFDayAgg[alpha_2]
    # elif stream == "mc":
    #     pass
    else:
        raise ValueError(f'Stream {stream} not allowed for tfidf')
    q = (
        f"""
        select 	
            tz.lemma as lemma
            , avg(tz.tfidf) as mean_value
        from {tablename(model)} tz 
        where 
           tz.date_id between {start_date} and {end_date}
        group by tz.lemma 
        order by avg(tz.tfidf) desc 
        limit {limit}
        """
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    


async def chart_studio_time_series_from_stream(
    pool, conditions, country_id, start_date, end_date, field, aggr=False
):
    """
    This function must be used only if topics are present in conditions, i.e. the variable topic_clause
    is not an empty string

    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    stream, field_type = field["stream"], field["type"]
    topic_col = "topic_id" if field_type == "anomaly" else "topic_unique_id"
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions, topic_col=topic_col)
        if field_type == "anomaly":  # TODO: fix this in the future
            emotion_clause = ""
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    if stream == "tg":
        topic_table = models.TgTopicIdPositive
        sentiment_table = models.TgSentiment
        count_table = models.TgDailyCounts
        record_col_name = "message_unique_id"
        suffix = "' (Social)'"
        join_additional_clause = ''
        if field_type == 'anomaly':
            topic_table = models.TopicIdDayAggTg
            sentiment_table = models.TgSentimentDayAgg
            record_col_name = "date_id"
            join_additional_clause = " and ttip.topic_id = ts.topic_id "
    elif stream == "mc":
        topic_table = models.MCTopicIdPositive
        sentiment_table = models.MCSentiment
        count_table = models.MCDailyCounts
        record_col_name = "story_id"
        suffix = "' (Media)'"
        join_additional_clause = ''
        if field_type == 'anomaly':
            topic_table = models.MCTopicIdDayAgg
            sentiment_table = models.MCSentimentDayAgg
            record_col_name = "date_id"
            join_additional_clause = " and ttip.topic_id = ts.topic_id "
    else:
        raise ValueError(f'Stream {stream} not allowed')
    if field_type == "attention":
        value_clause = ", sum(ttip.topic_norm_prevalence)/tdc.count as value"
        distinct_clause = ""
        if not aggr:
            field_clause = f", c.name || ' - '  || t.topic || ' - ' || {suffix}  as field"
            joint_topic_clause = f"join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id"
            group_by_clause = "group by ttip.country_id, d.date_actual, ttip.topic_unique_id, tdc.count, c.name, t.topic"
        else:
            field_clause = f", {suffix.replace('(', '').replace(')', '').replace(' ', '')}  as field"
            joint_topic_clause = " "
            group_by_clause = "group by ttip.country_id, d.date_actual, tdc.count, c.name"
    elif field_type == "sentiment":
        value_clause = ", avg(ts.sentiment) as value"
        distinct_clause = " distinct on (date_actual) "
        field_clause = f", {suffix.replace('(', '').replace(')', '').replace(' ', '')}  as field"
        joint_topic_clause = " "
        group_by_clause = "group by ttip.country_id, d.date_actual, tdc.count, c.name"
    elif field_type == "emotion":
        value_clause = (
            """, json_build_object(
                    'anger', sum(anger::float)/tdc.count,
                    'anticipation', sum(anticipation::float)/tdc.count,
                    'disgust', sum(disgust::float)/tdc.count,
                    'fear', sum(fear::float)/tdc.count,
                    'joy', sum(joy::float)/tdc.count,
                    'sadness', sum(sadness::float)/tdc.count,
                    'surprise', sum(surprise::float)/tdc.count,
                    'trust', sum(trust::float)/tdc.count
                ) AS value  
            """
            )
        distinct_clause = " distinct on (date_actual) "
        field_clause = f", c.name  || ' - Emotion - ' || {suffix} as field"
        joint_topic_clause = " "
        group_by_clause = "group by ttip.country_id, d.date_actual, tdc.count, c.name"
    elif field_type == "anomaly":
        value_clause = f", count(*) filter (where is_anomaly) as value, ARRAY_AGG(t.topic) FILTER (WHERE is_anomaly) AS topic_names "
        distinct_clause = ""
        joint_topic_clause = f"join {tablename(models.Topic)} t on t.id = ttip.topic_id"
        if not aggr:
            # field_clause = f", c.name || ' - '  || t.topic || ' - ' || {suffix}  as field"
            # group_by_clause = "group by ttip.country_id, d.date_actual, ttip.topic_id, tdc.count, c.name, t.topic"
            field_clause = f", c.name || ' - ' || {suffix}  as field"
            group_by_clause = "group by ttip.country_id, d.date_actual,  tdc.count, c.name"
        else:
            field_clause = f", {suffix.replace('(', '').replace(')', '').replace(' ', '')}  as field"
            group_by_clause = "group by ttip.country_id, d.date_actual, tdc.count, c.name"

    q = (
        f'''
            select
                 {distinct_clause}
                d.date_actual as date
                , '{stream}' as stream
                {value_clause}
                {field_clause}
            from {tablename(topic_table)} ttip
            join {tablename(sentiment_table)} ts on ttip.{record_col_name} = ts.{record_col_name}
                and ttip.country_id = ts.country_id 
                {join_additional_clause}
            join {tablename(count_table)} tdc on 
                tdc.date_id = ttip.date_id and tdc.country_id = ttip.country_id
            join {tablename(models.Date)} d on ttip.date_id = d.id
            join {tablename(models.Country)} c on c.country_code = {country_id}
            {joint_topic_clause}
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            {group_by_clause}
            ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    


async def chart_studio_time_series_from_ssi(
    pool, country_id: int, start_date: int, end_date: int, conditions
):
    nested_dicts = lambda: defaultdict(nested_dicts)
    b = nested_dicts()
    for cond in conditions:
        op = b[cond["field"]][cond["operator"]]
        if not op:
            b[cond["field"]][cond["operator"]] = [cond["value"]]
            
        else:
            b[cond["field"]][cond["operator"]].append(cond["value"])
    ssi_field_ids = []
    if b["Topic"].get("IS"): 
        ssi_field_ids = b["Topic"]["IS"]
    if not ssi_field_ids:
        return []
    field_clause = f"({', '.join(str(x) for x in ssi_field_ids)})"
    q = (
        f'''
        with field_names as (
            select 
                lower(t.topic) as topic_name
            from {tablename(models.Topic)} t
            where t.id in {field_clause}
        )
        select
            d.date_actual as date
            , sda.value as value
            , c.name || ' - ' || sf.field || ' - (SSI)' as field
        from {tablename(models.SSIDayAgg)} sda
        join {tablename(models.Date)} d on sda.date_id = d.id
        join {tablename(models.Country)} c on c.country_code = {country_id}
        join {tablename(models.SSIField)} sf on sda.ssi_field_id = sf.id
        join field_names f on lower(f.topic_name) = lower(sf.field)
        where 
            sda.date_id >= {start_date} and sda.date_id <= {end_date}
            and sda.country_id = {country_id} 
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def chart_studio_bar_chart_from_stream(
    pool, conditions, country_id, start_date, end_date, field
):
    """
    This function must be used only if topics are present in conditions, i.e. the variable topic_clause
    is not an empty string

    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    stream, field_type = field["stream"], field["type"]
    topic_col = "topic_id" if field_type == "anomaly" else "topic_unique_id"
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions, topic_col=topic_col)
        if field_type == "anomaly":  # TODO: fix this in the future
            emotion_clause = ""
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
        
    if stream == "tg":
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_col_name = "message_unique_id"
        suffix = "' (Social)'"
        count_model = models.TgDailyCounts
        join_additional_clause = ''
        if field_type == 'anomaly':
            topic_model = models.TopicIdDayAggTg
            sentiment_model = models.TgSentimentDayAgg
            record_col_name = "date_id"
            join_additional_clause = " and ttip.topic_id = ts.topic_id "
    elif stream == "mc":
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_col_name = "story_id"
        suffix = "' (Media)'"
        count_model = models.MCDailyCounts
        join_additional_clause = ''
        if field_type == 'anomaly':
            topic_model = models.MCTopicIdDayAgg
            sentiment_model = models.MCSentimentDayAgg
            record_col_name = "date_id"
            join_additional_clause = " and ttip.topic_id = ts.topic_id "
    else:
        raise ValueError(f'Stream {stream} not allowed')
    if field_type == "attention":
        frequency_clause = " sum(1)::float/(SELECT total_count FROM total_count) as frequency"
        distinct_clause = ""
        field_clause = f", c.name || ' - '  || t.topic || ' - ' || {suffix}  as field"
        joint_topic_clause = f"join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id"
        group_by_clause = "group by ttip.country_id, ttip.topic_unique_id, c.name, t.topic"
        order_clause = ' order by frequency desc '
    elif field_type == "sentiment":
        frequency_clause = (
            """
             json_build_object(
                'positive', SUM(CASE WHEN ts.sentiment > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count),
                'negative', SUM(CASE WHEN ts.sentiment < 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count),
                'neutral', SUM(CASE WHEN ts.sentiment = 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) 
            ) as frequency 
            """
        )
        
        distinct_clause = " distinct on (date_actual) "
        field_clause = f", c.name  || ' - Sentiment - ' || {suffix} as field"
        joint_topic_clause = " "
        group_by_clause = "group by ttip.country_id, c.name " 
        order_clause = ' '
    elif field_type == "emotion":
        frequency_clause = (
            """ json_build_object(
                    'anger', SUM(CASE WHEN ts.anger > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'anticipation', SUM(CASE WHEN ts.anticipation > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'disgust', SUM(CASE WHEN ts.disgust > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'fear', SUM(CASE WHEN ts.fear > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'joy', SUM(CASE WHEN ts.joy > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'sadness', SUM(CASE WHEN ts.sadness > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'surprise', SUM(CASE WHEN ts.surprise > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) ,
                    'trust', SUM(CASE WHEN ts.trust > 0  THEN 1 ELSE 0 END)::float/(SELECT total_count FROM total_count) 
                ) AS frequency  
            """
            )
        distinct_clause = " distinct on (date_actual) "
        field_clause = f", c.name  || ' - Emotion - ' || {suffix} as field"
        joint_topic_clause = " "
        group_by_clause = "group by ttip.country_id, c.name"
        order_clause = ' '
    elif field_type == "anomaly":
        date1 = dt.datetime.strptime(str(start_date), '%Y%m%d')
        date2 = dt.datetime.strptime(str(end_date), '%Y%m%d')
        day_difference = (date2 - date1).days + 1
        frequency_clause = f" (count(*) filter (where is_anomaly))::float/{day_difference} AS frequency "
        distinct_clause = ""
        joint_topic_clause = f"join {tablename(models.Topic)} t on t.id = ttip.topic_id"
    
        field_clause = f", c.name || ' - '  || t.topic || ' - ' || {suffix}  as field"
        group_by_clause = "group by ttip.country_id, ttip.topic_id, t.topic, c.name"
        order_clause = ' order by frequency desc '
    q = (
        f'''
            WITH total_count AS (
                SELECT
                    SUM(cm.count) AS total_count
                FROM {tablename(count_model)} cm
                WHERE
                    cm.country_id = {country_id}
                    AND cm.date_id BETWEEN {start_date} AND {end_date}
            )
            select
                -- {distinct_clause} 
                {frequency_clause}
                {field_clause}
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_col_name} = ts.{record_col_name}
                and (ts.country_id = {country_id})
                {join_additional_clause}
            join {tablename(models.Country)} c on c.country_code = ttip.country_Id
            join {tablename(models.Date)} d on d.id = ttip.date_id
            {joint_topic_clause}
            
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            {group_by_clause}
            {order_clause}
            ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    


async def chart_studio_bar_chart_from_ssi(
    pool, country_id: int, start_date: int, end_date: int, conditions
):
    nested_dicts = lambda: defaultdict(nested_dicts)
    b = nested_dicts()
    for cond in conditions:
        op = b[cond["field"]][cond["operator"]]
        if not op:
            b[cond["field"]][cond["operator"]] = [cond["value"]]
            
        else:
            b[cond["field"]][cond["operator"]].append(cond["value"])
    ssi_field_ids = []
    if b["Topic"].get("IS"): 
        ssi_field_ids = b["Topic"]["IS"]
    if not ssi_field_ids:
        return []
    field_clause = f"({', '.join(str(x) for x in ssi_field_ids)})"
    q = (
        f'''
        with field_names as (
            select 
                lower(t.topic) as topic_name
            from {tablename(models.Topic)} t
            where t.id in {field_clause}
        )
        select
            avg(sda.value) as frequency
            , c.name || ' - ' || sf.field || ' - (SSI)' as field
        from {tablename(models.SSIDayAgg)} sda
        join {tablename(models.Date)} d on sda.date_id = d.id
        join {tablename(models.Country)} c on c.country_code = {country_id}
        join {tablename(models.SSIField)} sf on sda.ssi_field_id = sf.id
        join field_names f on lower(f.topic_name) = lower(sf.field)
        where 
            sda.date_id >= {start_date} and sda.date_id <= {end_date}
            and sda.country_id = {country_id}
        group by sf.field, c.name
        ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def time_series_emotions(
        pool, conditions, country_id, start_date, end_date, stream="tg"
    ):
    """
    This function must be used only if topics are present in conditions, i.e. the variable topic_clause
    is not an empty string

    Args:
        pool (_type_): _description_
        conditions (_type_): _description_
        country_id (_type_): _description_
        start_date (_type_): _description_
        end_date (_type_): _description_

    Returns:
        _type_: _description_
    """
    if conditions is not None:
        topic_clause, sentiment_clause, emotion_clause = generate_filter_clauses(conditions)
    else:
        topic_clause, sentiment_clause, emotion_clause = "", "", ""
    if stream == "tg":
        topic_table = models.TgTopicIdPositive
        sentiment_table = models.TgSentiment
        record_col_name = "message_unique_id"
        daily_counts_table = models.TgDailyCounts
    elif stream == "mc":
        topic_table = models.MCTopicIdPositive
        sentiment_table = models.MCSentiment
        record_col_name = "story_id"
        daily_counts_table = models.MCDailyCounts
    else:
        raise ValueError(f'Stream {stream} not allowed')
    value_clause = (
            """, json_build_object(
                    'anger', avg(anger::float),
                    'anticipation', avg(anticipation::float),
                    'disgust', avg(disgust::float),
                    'fear', avg(fear::float),
                    'joy', avg(joy::float),
                    'sadness', avg(sadness::float),
                    'surprise', avg(surprise::float),
                    'trust', avg(trust::float)
                ) AS value  
            """
    )
    distinct_clause = " distinct on (date_actual) "
    field_clause = f", c.name  || ' - Emotion - ' || '{stream}' as field"
    joint_topic_clause = " "
    group_by_clause = "group by ttip.country_id, d.date_actual, tdc.count, c.name"

    q = (
        f'''
            select
                -- {distinct_clause}
                d.date_actual as date
                {value_clause}
                {field_clause}
            from {tablename(topic_table)} ttip
            join {tablename(sentiment_table)} ts on ttip.{record_col_name} = ts.{record_col_name}
                and ttip.country_id = ts.country_id
            join {tablename(daily_counts_table)} tdc on 
                tdc.date_id = ttip.date_id and tdc.country_id = ttip.country_id
            join {tablename(models.Date)} d on ttip.date_id = d.id
            join {tablename(models.Country)} c on c.country_code = {country_id}
            {joint_topic_clause}
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            {group_by_clause}
            ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    
