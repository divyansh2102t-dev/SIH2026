"""
SIH 2026 - Problem Statement 26171 (ISRO)
WebSocket Connection Manager
"""

from typing import Dict
from fastapi import WebSocket

class WebSocketConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"[WebSocket Manager] Client connected: {client_id} (Total: {len(self.active_connections)})")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"[WebSocket Manager] Client disconnected: {client_id} (Total: {len(self.active_connections)})")

    async def send_action(self, client_id: str, action_data: dict):
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json(action_data)

manager = WebSocketConnectionManager()
