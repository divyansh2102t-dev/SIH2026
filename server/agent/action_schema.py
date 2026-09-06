"""
SIH 2026 - Problem Statement 26171 (ISRO)
Structured Action Command Schema (Pydantic v2)
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ActionType(str, Enum):
    CLICK = "click"
    TYPE = "type"
    SCROLL = "scroll"
    SELECT = "select"
    FILL_LOCAL = "fill_local"   # Zero-Trust: instructs client to fill from local storage
    WAIT = "wait"
    NAVIGATE = "navigate"
    DONE = "done"
    ERROR = "error"

class ActionCommand(BaseModel):
    action: ActionType = Field(description="The atomic browser action to execute")
    selector: Optional[str] = Field(default=None, description="CSS selector or XPath of the target DOM element")
    text: Optional[str] = Field(default=None, description="Text string to type into input fields")
    direction: Optional[str] = Field(default="down", description="Scroll direction: 'up' or 'down'")
    amount: Optional[int] = Field(default=350, description="Scroll amount in pixels")
    value: Optional[str] = Field(default=None, description="Value for dropdown select elements")
    url: Optional[str] = Field(default=None, description="URL target for navigation")
    local_data_key: Optional[str] = Field(default=None, description="Local vault key (e.g. 'email', 'aadhaar', 'pan') for fill_local actions")
    duration_ms: Optional[int] = Field(default=1000, description="Duration in milliseconds for wait actions")
    reasoning: Optional[str] = Field(default=None, description="VLM chain-of-thought explanation for why this action was chosen")
    summary: Optional[str] = Field(default=None, description="Final summary of task accomplishment when action is 'done'")

class RedactedRegionManifest(BaseModel):
    method: str
    token: str
    source: str
    bounds: Dict[str, int]

class SanitizedClientPayload(BaseModel):
    sessionId: str
    timestamp: int
    iteration: int = 1
    userGoal: str
    redactedScreenshot: str # Base64 data URL
    accessibilityTree: List[Dict[str, Any]] = []
    redactionLog: List[RedactedRegionManifest] = []
    pageMetadata: Dict[str, Any] = {}
    previousActions: List[Dict[str, Any]] = []
