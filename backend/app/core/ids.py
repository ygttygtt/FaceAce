"""ID generation helper."""
import uuid


def new_id() -> str:
    """Return a 32-char hex string (uuid4)."""
    return uuid.uuid4().hex
