from fews2board.db.models import TgSentimentDayDomainAgg, \
    TopicIdDayDomainAggTg, MCTopicIdDayDomainAgg, MCSentimentDayDomainAgg
from fews2board.db import models
from fews2board.db.utils import tablename
from psycopg.rows import dict_row
import datetime as dt
from collections import defaultdict
from dateutil.parser import parse


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
    WHERE tti.date_id = 
    (
    	SELECT MAX(tidat.date_id) FROM {tablename(agg_model)} tidat 
    )
   
    )
    SELECT 
        country_id
        , alpha_2
        , topic_id
        , date_id
        , np
        , '{stream}' as stream
    FROM row_numbers WHERE row_num <={top_n};

    ''')
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
                , country_id
                , alpha_2
                , country
                , avg(sentiment) sentiment
                , (avg(sentiment) - avg(prev)) as delta
                , '{stream}' as stream
            from prev_r
            group by country_id, date_id, country, alpha_2
            order by date_id desc
            limit 1
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
        agg_model = models.TgTopicIdCountDayDomainAgg
        count_var = 'msg_count'
    elif stream == "mc":
        agg_model = models.MCTopicIdCountDayDomainAgg
        count_var = 'story_count'
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        select 
            sum(topic_count)::float/sum({count_var}) as frequency
            , domain_id
            , dom.name as domain
        from {tablename(agg_model)}  tticda 
        join {tablename(models.Date)} d on tticda.date_id = d.id
        join {tablename(models.Domain)} dom on tticda.domain_id = dom.id
        where
            tticda.country_id = {country_id}
            and (d.id >= {start_date} and d.id <= {end_date})
        group by tticda.domain_id, dom.name
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
    print(q)
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
    elif stream == "mc":
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_col_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        select 
            d.date_actual as date
            , d2.name as domain
            , avg(topic_norm_prevalence) as value
        from {tablename(topic_model)} ttip
        join {tablename(sentiment_model)} ts on ttip.{record_col_name} = ts.{record_col_name}
        join {tablename(models.Date)} d on ttip.date_id = d.id
        join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
        join {tablename(models.Domain)} d2 on t.domain_id = d2.id
        where 
            ttip.country_id = {country_id}
            and ttip.date_id between {start_date} and {end_date}
            {topic_clause} 
            {sentiment_clause} 
            {emotion_clause} 
        
        group by d.date_actual, d2.name
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
    pool, country_id: int, start_date: int, end_date: int, ssi_domain_id: int = 3
):
    q = (
        f'''
        select
            d.date_actual as date
            , sda.value as ssi_w
        from {tablename(models.SSIDayAgg)} sda
        join {tablename(models.Date)} d on sda.date_id = d.id
        where 
            sda.date_id >= {start_date} and sda.date_id <= {end_date}
            and sda.country_id = {country_id}
            and sda.ssi_domain_id = {ssi_domain_id}
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
            ms.author_username as username
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
        print(cond)
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


async def mc_stories(
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
            ms.media_name as username
            , ms.url as url
            , ms.publish_date as timestamp
            , ms.title as body
        from {tablename(models.MCSentiment)} ts 
        join {tablename(models.MCTopicIdPositive)} ttip on ts.story_id = ttip.story_id
        join {tablename(models.MCStory)} ms on ms.id = ts.story_id
        where 
            ms.country_id = {country_id} and 
            ms.publish_date::DATE between '{start_date}' and '{end_date}' 
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


def generate_filter_clauses(conditions, topic_table_alias="ttip", sent_table_alias="ts"):
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
        topic_clause = f' AND ({" OR ".join(f"{topic_table_alias}.topic_unique_id = {f} " for f in b["Topic"]["IS"])})'
    if b["Sentiment"].get("IS") or b["Sentiment"].get("IS NOT"):
        sentiment_clause = (
            f'''
             AND (
                {" AND ".join(
                    f"{sent_table_alias}.{v} {(' > 0', ' = 0 ')[key == 'IS NOT']} " 
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
                    f"{sent_table_alias}.{v} {(' > 0', ' = 0 ')[key == 'IS NOT']} " 
                    for key, values in b["Emotion"].items()
                    for v in values
                )}
             )
            '''
        )
    return (topic_clause, sentiment_clause, emotion_clause)


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
    elif stream == "mc":
        topic_table = models.MCTopicIdPositive
        sentiment_table = models.MCSentiment
        record_col_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        
            select
                ttip.date_id as date_id
                , ttip.topic_norm_prevalence as value
                , t.topic as topic
            from {tablename(topic_table)} ttip
            join {tablename(sentiment_table)} ts on ttip.{record_col_name} = ts.{record_col_name}
            join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
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
        count_model = models.TgTopicIdCountDayAgg
        count_col_name = "msg_count"
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_id_name = "message_unique_id"
    elif stream == "mc":
        count_model = models.MCTopicIdCountDayAgg
        count_col_name = "story_count"
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_id_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        with msg_count_in_period as (
            select sum(dcounts.msg_count) as value
            from (
                select 
                    distinct cda.date_id, cda.country_id, cda.{count_col_name} as msg_count
                from {tablename(count_model)} as cda
                where 
                    cda.country_id = {country_id}
                    and (cda.date_id >= {start_date} and cda.date_id <= {end_date})
            ) as dcounts
            
        )
            select
                sum(ttip.topic_norm_prevalence)/mc.value as frequency
                , t.topic as topic
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
            join {tablename(models.Topic)} as t on ttip.topic_unique_id = t.id
            join msg_count_in_period mc on true
            
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            group by t.topic, mc.value
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
        count_model = models.TgTopicIdCountDayAgg
        count_col_name = "msg_count"
        topic_model = models.TgTopicIdPositive
        sentiment_model = models.TgSentiment
        record_id_name = "message_unique_id"
    elif stream == "mc":
        count_model = models.MCTopicIdCountDayAgg
        count_col_name = "story_count"
        topic_model = models.MCTopicIdPositive
        sentiment_model = models.MCSentiment
        record_id_name = "story_id"
    else:
        raise ValueError(f'Stream {stream} not allowed')
    q = (
        f'''
        with msg_count_in_period as (
            select sum(dcounts.msg_count) as value
            from (
                select 
                    distinct cda.date_id, cda.country_id, cda.{count_col_name} as msg_count
                from {tablename(count_model)} as cda
                where 
                    cda.country_id = {country_id}
                    and (cda.date_id >= {start_date} and cda.date_id <= {end_date})
            ) as dcounts
            
        )
            select
                sum(1)::float/mc.value as frequency
                , domain_id
                , dom.name as domain

                
            from {tablename(topic_model)} ttip
            join {tablename(sentiment_model)} ts on ttip.{record_id_name} = ts.{record_id_name}
            join msg_count_in_period mc on true
            join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
            join {tablename(models.Domain)} dom on t.domain_id = dom.id 
            
            where 
                (ttip.date_id >= {start_date} and ttip.date_id <= {end_date}) 
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause}
                {emotion_clause}
            group by dom.name, domain_id, mc.value
            order by frequency desc
            ;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result 



async def talking_points_on_conditions(pool, conditions, country_id, start_date, end_date):
    """
    This function can be used on any kind of conditions (topic, sentiment, emotion)
    It does an avereage prevalence for each domain of the framekork within country and period and other conditions

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
        with
        
        prev_values 
        as (
            select 
                t.domain_id as domain_id
                , avg(ttip.topic_norm_prevalence) as prev_attention
                , avg(sentiment) as prev_sentiment
            from {tablename(models.TgTopicIdPositive)} ttip
            join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
            join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
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
            , avg(ttip.topic_norm_prevalence) as latest_attention
            , prev_values.prev_attention as prev_attention
            , prev_values.prev_sentiment as prev_sentiment
        
        from {tablename(models.TgTopicIdPositive)} ttip
        join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
        join {tablename(models.Topic)} t on ttip.topic_unique_id = t.id
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
    print(q)
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result


async def talking_points_on_conditions(pool, conditions, country_id, start_date, end_date):
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
        with filt_prev_msg as (
            select 
                ttip.message_unique_id
                ,'prev' as _type
            from {tablename(models.TgTopicIdPositive)} ttip
            join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
            where  
                ttip.date_id between {prev_start_date} and {prev_end_date}
                and ttip.country_id = {country_id}
                {topic_clause}
                {sentiment_clause} 
                {emotion_clause}
                    
        ),	
        filt_latest_msg as (
            select 
                ttip.message_unique_id
                , 'latest' as _type
            from {tablename(models.TgTopicIdPositive)} ttip
            join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
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
                avg(topic_norm_prevalence) as attention
                , avg(sentiment) as sentiment
                , t.domain_id as domain_id
                , d.name as domain
                , _type as type
            from tot_messages l
            join  {tablename(models.TgTopicIdPositive)} ttip on l.message_unique_id = ttip.message_unique_id
            join {tablename(models.TgSentiment)} ts on ttip.message_unique_id = ts.message_unique_id
            join {tablename(models.Topic)} t on t.id = ttip.topic_unique_id
            join {tablename(models.Domain)} d on t.domain_id = d.id
            
            group by t.domain_id, d.name, l._type
            ;
                '''
        )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result        
