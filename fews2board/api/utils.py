from fews2board.db.models import TgSentimentDayDomainAgg, \
    TopicIdDayDomainAggTg, MCTopicIdDayDomainAgg, MCSentimentDayDomainAgg
from fews2board.db import models
from fews2board.db.utils import tablename
from psycopg.rows import dict_row
import datetime as dt


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


async def top_topics_on_latest(pool, top_n=3):
    """ this query gets results from the most recent date present in 
    topic aggregated table, but we should get them from tg_message or not
    aggregated ones

    """
    q = (f'''
    WITH row_numbers AS (
    SELECT row_number() OVER (
        PARTITION BY tti.country_id
        ORDER BY tti.topic_norm_prevalence desc
    )   AS row_num
        , tti.country_id AS country_id
        , cou.name as country
        , tti.topic_id AS topic_id
        , t.topic as topic
       	, tti.topic_norm_prevalence AS np
     	, tti.date_id
    FROM {tablename(models.TopicIdDayAggTg)} AS tti
    join {tablename(models.Topic)} t on tti.topic_id = t.id
    join {tablename(models.Country)} cou on tti.country_id = cou.country_code
    WHERE tti.date_id = 
    (
    	SELECT MAX(tidat.date_id) FROM {tablename(models.TopicIdDayAggTg)} tidat 
    )
   
    )
    SELECT country_id, topic_id, date_id, np FROM row_numbers WHERE row_num <={top_n};

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


async def latest_sentiment_with_delta(pool):
    q = (
        f'''
        with prev_r as (
            select 
                date_id
                , country_id
                , cou.name as country
                , domain_id
                , sentiment
                , lag(sentiment) over (
                    partition by country_id , domain_id 
                    order by date_id 
                    
                ) as prev
                
            from {tablename(models.TgSentimentDayDomainAgg)} ts
            join {tablename(models.Country)} cou on ts.country_id = cou.country_code
        )
            select 
                date_id
                , country_id
                , country
                , avg(sentiment) sentiment
                , (avg(sentiment) - avg(prev)) as delta
            from prev_r
            group by country_id, date_id, country
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
    prev_start_date, prev_end_date = end_date, end_date - day_difference

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
    prev_start_date, prev_end_date = end_date, end_date - day_difference

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
