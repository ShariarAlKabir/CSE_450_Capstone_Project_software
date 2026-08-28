import os

import psycopg2
from psycopg2.extras import RealDictCursor


def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "/tmp"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "fabric_fault_detection"),
        user=os.getenv("DB_USER", "dipsaha"),
        password=os.getenv("DB_PASSWORD", ""),
        cursor_factory=RealDictCursor,
    )
