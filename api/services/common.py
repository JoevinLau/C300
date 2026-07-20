from __future__ import annotations

import logging

from db import DatabaseUnavailable

logger = logging.getLogger("service")


def log_db_error(message: str, exc: BaseException, **context: object) -> None:
    if isinstance(exc, DatabaseUnavailable):
        logger.warning("%s. context=%s error=%s", message, context, exc)
        return

    logger.exception("%s context=%s error=%s", message, context, exc)
    print(f"{message}: {exc} context={context}", flush=True)
