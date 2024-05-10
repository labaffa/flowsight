from fews2board.db.models import TgSentimentDayDomainAgg, \
    TopicIdDayDomainAggTg, MCTopicIdDayDomainAgg, MCSentimentDayDomainAgg
from fews2board.db import models
from fews2board.db.utils import tablename
from psycopg.rows import dict_row


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
        pool, country_id: int, start_date: int, end_date: int
):
    q = (
        f'''
        select 
            sum(topic_count)::float/sum(msg_count) as frequency
            , domain_id
        from {tablename(models.TgTopicIdCountDayDomainAgg)}  tticda 
        join {tablename(models.Date)} d on tticda.date_id = d.id
        where
            tticda.country_id = {country_id}
            and (d.id >= {start_date} and d.id <= {end_date})
        group by tticda.domain_id
        order by frequency desc;
        '''
    )
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(q)
            result = await cur.fetchall()
    return result    