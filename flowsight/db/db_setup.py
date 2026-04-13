from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from flowsight import config
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import create_engine

# ASYNC_SQLALCHEMY_DATABASE_URL = config.PG_ASYNC_URL
# SQLALCHEMY_DATABASE_URL = config.PG_URL

# engine = create_engine(
#     SQLALCHEMY_DATABASE_URL, 
#     future=True,
#     pool_pre_ping=True
# )
# SessionLocal = sessionmaker(
#     engine, 
#     expire_on_commit=False, 
#     autocommit=False, 
#     autoflush=False
# )
# async_engine = create_async_engine(
#     ASYNC_SQLALCHEMY_DATABASE_URL, 
#     future=True,
#     pool_pre_ping=True
# )
# AsyncSessionLocal = sessionmaker(
#     async_engine, class_=AsyncSession, expire_on_commit=False, 
#     autocommit=False, autoflush=False
#  )

# Base = declarative_base()


# async def get_async_db():
#     async with AsyncSessionLocal() as db:
#         yield db
#         await db.commit()

# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()
