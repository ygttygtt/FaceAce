"""Logging configuration."""
import logging
import os
import sys


def setup_logging() -> None:
    log_file = os.environ.get("FACEACE_LOG_FILE")
    handlers: list[logging.Handler]
    if log_file:
        handlers = [logging.FileHandler(log_file, encoding="utf-8")]
    else:
        handlers = [logging.StreamHandler(sys.stdout or sys.stderr)]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
        handlers=handlers,
        force=True,
    )
    # Quiet noisy libs
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
