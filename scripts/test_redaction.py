"""
SIH 2026 - Problem Statement 26171 (ISRO)
Automated Verification Test Suite for PII Precision, Redaction & Server Endpoints
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add server path to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server")))

from main import app
from agent.action_schema import ActionCommand, ActionType, SanitizedClientPayload
from agent.react_agent import SENSITIVE_PATTERNS
from agent.prompt_templates import build_vlm_user_prompt

client = TestClient(app)

def test_health_check():
    """Verify server gateway health endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "ISRO Privacy Agent" in data["service"]

def test_demo_testbed_mount():
    """Verify demo testbed is mounted and serving HTML"""
    response = client.get("/demo/index.html")
    assert response.status_code == 200
    assert "National Citizen & Travel Portal" in response.text

def test_pii_security_patterns():
    """Verify regex patterns catch Indian PII accurately"""
    aadhaar_sample = "My Aadhaar is 2345 6789 0123 for verification"
    pan_sample = "Taxpayer PAN: ABCDE1234F"
    mobile_sample = "Call me at +919876543210"
    email_sample = "Official email: user.citizen@isro.gov.in"

    assert any(p.search(aadhaar_sample) for p in SENSITIVE_PATTERNS)
    assert any(p.search(pan_sample) for p in SENSITIVE_PATTERNS)
    assert any(p.search(mobile_sample) for p in SENSITIVE_PATTERNS)
    assert any(p.search(email_sample) for p in SENSITIVE_PATTERNS)

def test_action_command_serialization():
    """Verify structured Pydantic ActionCommand schema"""
    cmd = ActionCommand(
        action=ActionType.FILL_LOCAL,
        selector="#user-email",
        local_data_key="email",
        reasoning="Testing zero-trust local vault fill"
    )
    dumped = cmd.model_dump()
    assert dumped["action"] == "fill_local"
    assert dumped["local_data_key"] == "email"

def test_prompt_template_builder():
    """Verify that prompt builder injects goal and structural context without raw PII"""
    prompt = build_vlm_user_prompt(
        goal="Book flight to Mumbai",
        accessibility_tree=[
            {"tag": "input", "role": "textbox", "text": "Delhi", "selector": "#fromCity", "bounds": {"x": 10, "y": 20}}
        ],
        redaction_log=[
            {"token": "[PII_EMAIL]", "method": "blackout", "bounds": {"x": 100, "y": 200}}
        ],
        previous_actions=[],
        iteration=1
    )

    assert "Book flight to Mumbai" in prompt
    assert "[PII_EMAIL]" in prompt
    assert "#fromCity" in prompt

if __name__ == "__main__":
    pytest.main(["-v", __file__])
