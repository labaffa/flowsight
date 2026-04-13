from flowsight import config
import psycopg


def tablename(model):
    return ".".join(
        [
            model.__table__.schema,
            model.__table__.name
        ]
    )


def get_connection(**kw):
    host = kw.pop("host", config.PG_HOST)
    if ":" in host:
        host, port = host.split(":")
    else:
        port = kw.pop("port", config.PG_PORT)
    connection = psycopg.connect(
        host=host,
        port=port,
        database=kw.pop("database", config.PG_DATABASE),
        user=kw.pop("user", config.PG_USER),
        password=kw.pop("password", config.PG_PASSWORD)
    )
    connection.set_client_encoding('utf-8')
    return connection


def get_conn_str():
    host = config.PG_HOST
    if ":" in host:
        host, port = host.split(":")
    else:
        port = config.PG_PORT
    return f"""
        dbname={config.PG_DATABASE}
        user={config.PG_USER}
        password={config.PG_PASSWORD}
        host={host}
        port={port}
    """
