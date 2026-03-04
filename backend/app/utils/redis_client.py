"""
Redis client singleton with graceful degradation.

If Redis is unavailable (not configured, not running), all cache operations
become no-ops so the app continues to work — just without caching.
"""
import json
import logging
from typing import Any, Optional

import redis

from app.database.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singleton client
# ---------------------------------------------------------------------------

_client: Optional[redis.Redis] = None


def get_redis() -> Optional[redis.Redis]:
    """Return the Redis client, or None if Redis is unavailable."""
    global _client
    if _client is not None:
        return _client
    try:
        client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        client.ping()          # fail fast if Redis is down
        _client = client
        logger.info("✅ Redis connected at %s", settings.redis_url)
    except Exception as exc:
        logger.warning("⚠️  Redis unavailable (%s) — caching disabled", exc)
        _client = None
    return _client


# ---------------------------------------------------------------------------
# Cache TTLs (seconds)
# ---------------------------------------------------------------------------

QUESTIONS_TTL = 3600        # 1 hour  — questions rarely change once drive starts
SESSION_TTL   = 7200        # 2 hours — matches exam window upper bound
RATE_LIMIT_TTL = 60         # 1 minute sliding window for rate limiting


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def _questions_key(drive_id: int) -> str:
    return f"questions:drive:{drive_id}"

def _session_key(token: str) -> str:
    return f"session:token:{token}"

def _rate_limit_key(prefix: str, ip: str) -> str:
    return f"rl:{prefix}:{ip}"


# ---------------------------------------------------------------------------
# Questions cache
# ---------------------------------------------------------------------------

def cache_get_questions(drive_id: int) -> Optional[list]:
    """Return cached question list for *drive_id*, or None on miss/error."""
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(_questions_key(drive_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis cache_get_questions error: %s", exc)
        return None


def cache_set_questions(drive_id: int, questions: list) -> None:
    """Store serialised question list in cache."""
    r = get_redis()
    if r is None:
        return
    try:
        r.setex(_questions_key(drive_id), QUESTIONS_TTL, json.dumps(questions))
    except Exception as exc:
        logger.warning("Redis cache_set_questions error: %s", exc)


def cache_invalidate_questions(drive_id: int) -> None:
    """Bust the question cache for a drive (call when questions are edited)."""
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(_questions_key(drive_id))
    except Exception as exc:
        logger.warning("Redis cache_invalidate_questions error: %s", exc)


# ---------------------------------------------------------------------------
# Student session cache
# ---------------------------------------------------------------------------

def cache_get_session(token: str) -> Optional[dict]:
    """Return cached session dict for *token*, or None on miss/error."""
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(_session_key(token))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis cache_get_session error: %s", exc)
        return None


def cache_set_session(token: str, data: dict) -> None:
    """Store session data keyed by access token."""
    r = get_redis()
    if r is None:
        return
    try:
        r.setex(_session_key(token), SESSION_TTL, json.dumps(data))
    except Exception as exc:
        logger.warning("Redis cache_set_session error: %s", exc)


def cache_invalidate_session(token: str) -> None:
    """Bust the session cache for a student (exam submitted / disqualified)."""
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(_session_key(token))
    except Exception as exc:
        logger.warning("Redis cache_invalidate_session error: %s", exc)


# ---------------------------------------------------------------------------
# Rate limiting  (fixed-window counter — caller chooses identifier and window)
# ---------------------------------------------------------------------------

def check_rate_limit(
    prefix: str,
    identifier: str,
    max_requests: int,
    window_seconds: int = 60,
) -> bool:
    """
    Increment the counter for *identifier* under *prefix*.
    Returns True  if the request is ALLOWED  (under the limit).
    Returns False if the request is REJECTED (limit exceeded).

    *identifier* can be an IP address, an access token, a student ID, etc.
    *window_seconds* sets the sliding-window length (default 60 s).

    Falls back to True (allow all) when Redis is unavailable.
    """
    r = get_redis()
    if r is None:
        return True  # degrade gracefully — no Redis means no rate limiting
    try:
        key = _rate_limit_key(prefix, identifier)
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        count, _ = pipe.execute()
        return count <= max_requests
    except Exception as exc:
        logger.warning("Redis rate_limit error: %s", exc)
        return True   # allow on error
