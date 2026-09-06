"""
SIH 2026 - Problem Statement 26171 (ISRO)
FastAPI Main Application Server & WebSocket Endpoint
"""

import os
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import settings
from ws_handler import manager
from agent.action_schema import SanitizedClientPayload
from agent.react_agent import ReActBrowserAgent

app = FastAPI(
    title="ISRO Privacy-Preserving Browser Agent Server",
    description="Backend reasoning hub for SIH 2026 Problem Statement 26171",
    version="1.0.0"
)

# Enable CORS for browser extensions and testbed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory agent sessions keyed by client_id
agent_sessions = {}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ISRO Privacy Agent Gateway",
        "active_clients": len(manager.active_connections),
        "settings": {
            "vlm_provider": settings.VLM_PROVIDER,
            "has_groq_key": bool(settings.GROQ_API_KEY),
            "max_steps": settings.MAX_STEPS_PER_SESSION
        }
    }

# Mount testbed interactive mock portal
testbed_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "testbed"))
if os.path.exists(testbed_path):
    app.mount("/demo", StaticFiles(directory=testbed_path, html=True), name="testbed")

@app.get("/")
async def root():
    return {
        "message": "ISRO Privacy-Preserving Agent Backend (SIH 2026 - PS 26171)",
        "demo_portal": "/demo/index.html",
        "websocket_endpoint": "/ws/{client_id}"
    }

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(client_id, websocket)
    
    if client_id not in agent_sessions:
        agent_sessions[client_id] = ReActBrowserAgent(session_id=client_id)
    
    agent = agent_sessions[client_id]

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
                payload = SanitizedClientPayload.model_validate(data)
                
                # Execute ReAct step
                action_command = await agent.process_step(payload)
                
                # Return ActionCommand JSON to Extension
                await manager.send_action(client_id, action_command.model_dump())
                
            except Exception as err:
                print(f"[WebSocket Error] Failed to process step: {err}")
                await manager.send_action(client_id, {
                    "action": "error",
                    "reasoning": f"Server processing exception: {str(err)}"
                })

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        if client_id in agent_sessions:
            del agent_sessions[client_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
