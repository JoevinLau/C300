from __future__ import annotations

from contextlib import contextmanager
import logging
import os
from pathlib import Path
import threading
import time
from typing import Any, Iterator, Sequence, TypeVar

import mysql.connector
from mysql.connector import Error as MySQLError
from mysql.connector import pooling
from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parent
ROOT_DIR = API_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(API_DIR / ".env", override=True)

logger = logging.getLogger(__name__)

T = TypeVar("T")
# mysql-connector creates every pooled connection eagerly. Three covers the
# desktop app's concurrent startup requests without serially opening ten TLS connections.
DEFAULT_DB_POOL_SIZE = 3

_pool_lock = threading.Lock()
_pool: pooling.MySQLConnectionPool | None = None


class DatabaseUnavailable(MySQLError):
    """Raised when TiDB cannot provide a connection after retries."""


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return int(value)


def _connection_config() -> dict[str, Any]:
    ssl_ca = os.getenv("DB_SSL_CA", "").strip()
    config: dict[str, Any] = {
        "host": os.getenv("DB_HOST", "").strip(),
        "port": _env_int("DB_PORT", 4000),
        "user": os.getenv("DB_USER", "").strip(),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "defaultdb").strip(),
        "connection_timeout": _env_int("DB_TIMEOUT_SECONDS", 5),
        "autocommit": False,
        "use_pure": True,
    }

    if not config["host"] or not config["user"]:
        raise DatabaseUnavailable("DB_HOST and DB_USER must be configured.")

    if ssl_ca:
        config.update(
            {
                "ssl_ca": ssl_ca,
                "ssl_verify_cert": _env_bool("DB_SSL_VERIFY_CERT", True),
                "ssl_verify_identity": _env_bool("DB_SSL_VERIFY_IDENTITY", True),
            }
        )

    return config


def init_pool(force: bool = False) -> pooling.MySQLConnectionPool:
    global _pool

    if _pool is not None and not force:
        return _pool

    with _pool_lock:
        if _pool is not None and not force:
            return _pool

        pool_size = _env_int("DB_POOL_SIZE", DEFAULT_DB_POOL_SIZE)
        if pool_size < 1:
            raise DatabaseUnavailable("DB_POOL_SIZE must be at least 1.")

        _pool = pooling.MySQLConnectionPool(
            pool_name=os.getenv("DB_POOL_NAME", "c300_tidb_pool"),
            pool_size=pool_size,
            pool_reset_session=True,
            **_connection_config(),
        )
        return _pool


def close_pool() -> None:
    global _pool
    with _pool_lock:
        _pool = None


def _is_retryable(exc: BaseException) -> bool:
    errno = getattr(exc, "errno", None)
    return errno in {
        2002,
        2003,
        2006,
        2013,
        2055,
    }


def _with_retry(operation_name: str, fn: Any) -> T:
    attempts = max(1, _env_int("DB_CONNECT_RETRIES", 3))
    delay = max(0.0, float(os.getenv("DB_RETRY_DELAY_SECONDS", "0.25")))
    last_exc: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except DatabaseUnavailable:
            raise
        except MySQLError as exc:
            last_exc = exc
            logger.error("%s failed on attempt %s/%s: %s", operation_name, attempt, attempts, exc)
            print(f"{operation_name} failed on attempt {attempt}/{attempts}: {exc}", flush=True)
            if attempt >= attempts or not _is_retryable(exc):
                break
            logger.warning(
                "%s failed on attempt %s/%s; retrying: %s",
                operation_name,
                attempt,
                attempts,
                exc,
            )
            close_pool()
            time.sleep(delay * attempt)

    raise DatabaseUnavailable(f"{operation_name} failed after {attempts} attempt(s): {last_exc}") from last_exc


def get_conn() -> mysql.connector.MySQLConnection:
    """Return a pooled TiDB/MySQL connection.

    Existing service code calls this directly and closes the connection when done.
    For new code, prefer `connection()` or FastAPI's `get_db()`.
    """

    def acquire() -> mysql.connector.MySQLConnection:
        conn = init_pool().get_connection()
        conn.ping(reconnect=True, attempts=1, delay=0)
        return conn

    return _with_retry("database connection", acquire)


@contextmanager
def connection() -> Iterator[mysql.connector.MySQLConnection]:
    conn = get_conn()
    try:
        yield conn
    except Exception:
        try:
            conn.rollback()
        except MySQLError:
            logger.exception("Database rollback failed.")
        raise
    finally:
        conn.close()


@contextmanager
def cursor(dictionary: bool = True) -> Iterator[mysql.connector.cursor.MySQLCursor]:
    with connection() as conn:
        cur = conn.cursor(dictionary=dictionary)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def execute_with_retry(
    sql: str,
    params: Sequence[Any] | None = None,
    *,
    dictionary: bool = True,
    fetch: str = "all",
) -> Any:
    def run() -> Any:
        with connection() as conn:
            cur = conn.cursor(dictionary=dictionary)
            try:
                cur.execute(sql, params or ())
                if fetch == "one":
                    result = cur.fetchone()
                elif fetch == "none":
                    result = None
                else:
                    result = cur.fetchall()
                conn.commit()
                return result
            finally:
                cur.close()

    return _with_retry("database query", run)


async def get_db() -> Iterator[mysql.connector.MySQLConnection]:
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()
