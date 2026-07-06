import asyncio
import threading
from typing import Any

_lock = threading.Lock()
_connections: set = set()
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop


def register(websocket):
    with _lock:
        _connections.add(websocket)


def unregister(websocket):
    with _lock:
        _connections.discard(websocket)


async def _broadcast(message: dict[str, Any]):
    with _lock:
        targets = list(_connections)
    dead = []
    for ws in targets:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    if dead:
        with _lock:
            for ws in dead:
                _connections.discard(ws)


def notify_state_change(state: dict[str, Any]):
    """Appelé depuis Flask (sync) après chaque sauvegarde."""
    if not _connections:
        return
    loop = _loop
    if loop is None or not loop.is_running():
        return
    payload = {"type": "state", "state": state}
    asyncio.run_coroutine_threadsafe(_broadcast(payload), loop)
