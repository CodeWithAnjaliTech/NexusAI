"""WebSocket connection manager for real-time chat."""

import json
from typing import Any

from fastapi import WebSocket

from app.core.logging import logger


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(session_id, []).append(websocket)
        logger.info("WebSocket connected: session=%s", session_id)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        if session_id in self.active:
            self.active[session_id] = [ws for ws in self.active[session_id] if ws != websocket]
            if not self.active[session_id]:
                del self.active[session_id]

    async def send_json(self, session_id: str, data: dict[str, Any]) -> None:
        for ws in self.active.get(session_id, []):
            try:
                await ws.send_json(data)
            except Exception as exc:
                logger.warning("WebSocket send failed: %s", exc)


ws_manager = ConnectionManager()
