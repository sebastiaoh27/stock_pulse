"""APScheduler setup with error handling."""

import logging

from apscheduler.events import EVENT_JOB_ERROR
from apscheduler.schedulers.background import BackgroundScheduler

from config import SCHEDULER_HOUR, SCHEDULER_MINUTE, SCHEDULER_TZ
from run_engine import execute_run

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _daily_job():
    logger.info("Running scheduled daily analysis (batch mode)...")
    try:
        execute_run("scheduled", use_batch=True)
    except Exception as e:
        logger.error(f"Scheduled run failed: {e}")


def _on_job_error(event):
    logger.error(f"Scheduler job error: {event.exception}", exc_info=event.exception)


def init_scheduler():
    scheduler.add_job(
        _daily_job,
        "cron",
        hour=SCHEDULER_HOUR,
        minute=SCHEDULER_MINUTE,
        timezone=SCHEDULER_TZ,
    )
    scheduler.add_listener(_on_job_error, EVENT_JOB_ERROR)
    scheduler.start()
    logger.info(f"Scheduler started: daily at {SCHEDULER_HOUR:02d}:{SCHEDULER_MINUTE:02d} {SCHEDULER_TZ}")
