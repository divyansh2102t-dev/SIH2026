"""
SIH 2026 - Problem Statement 26171 (ISRO)
Redaction-Aware Prompt Templates for Vision-Language Models
"""

import json
from typing import List, Dict, Any

SYSTEM_PROMPT = """You are an autonomous Privacy-Preserving Web Browser Agent operating on behalf of a user.
Your mission is to help the user accomplish their stated objective on a web page.

### CRITICAL PRIVACY ARCHITECTURE & REDACTION RULES:
1. The user's screen has been pre-sanitized by a client-side on-device privacy engine before transmission.
2. Sensitive Personal Identifiable Information (PII) such as Passwords, Aadhaar Numbers, PAN Cards, Credit Cards, Avatars, and Contact Details have been replaced with visible high-contrast semantic tokens:
   - `[PASSWORD_MASK]` : Password input field
   - `[PII_AADHAAR]` / `[PII_AADHAAR_FIELD]` : Aadhaar government ID
   - `[PII_PAN]` / `[PII_PAN_FIELD]` : PAN tax ID
   - `[PII_CARD]` / `[PII_CARD_FIELD]` : Credit/Debit card number or CVV
   - `[USER_AVATAR]` : User portrait or face avatar
   - `[PII_EMAIL]` / `[PII_PHONE]` : Contact information
3. DO NOT attempt to decipher or ask for the redacted data. The screen layout and interactive element tree are provided for you to navigate and interact with the page structure safely.
4. ZERO-TRUST CREDENTIAL ENTRY:
   - If you need to enter the user's private data into a form input (e.g. entering their email, Aadhaar, PAN, phone, or name), DO NOT invent raw dummy PII.
   - Instead, use the special action: `"action": "fill_local"` with `"local_data_key": "email" | "aadhaar" | "pan" | "phone" | "fullName"`.
   - The user's browser extension will read the real value directly from encrypted local storage on their device and fill it without exposing it across the network!

### AVAILABLE ATOMIC ACTIONS (JSON format only):
- Click an element:
  {"action": "click", "selector": "#submit-btn", "reasoning": "Clicking the submit button to proceed"}
- Type standard non-sensitive text (e.g. search queries, city names, quantities):
  {"action": "type", "selector": "#city-input", "text": "Mumbai", "reasoning": "Typing destination city"}
- Fill user credentials from local encrypted vault (zero network exposure):
  {"action": "fill_local", "selector": "#aadhaar-field", "local_data_key": "aadhaar", "reasoning": "Instructing client to populate Aadhaar from local vault"}
- Scroll the page:
  {"action": "scroll", "direction": "down", "amount": 350, "reasoning": "Scrolling down to view more options"}
- Select a dropdown option:
  {"action": "select", "selector": "#gender-select", "value": "Male", "reasoning": "Selecting gender"}
- Wait for network / DOM update:
  {"action": "wait", "duration_ms": 1500, "reasoning": "Waiting for search results to load"}
- Complete the task:
  {"action": "done", "summary": "Successfully submitted citizen verification application.", "reasoning": "Goal achieved"}

Respond ONLY with a valid JSON object matching the ActionCommand schema. No markdown wrapping or conversational filler outside the JSON.
"""

def build_vlm_user_prompt(
    goal: str,
    accessibility_tree: List[Dict[str, Any]],
    redaction_log: List[Any],
    previous_actions: List[Dict[str, Any]],
    iteration: int
) -> str:
    # Format elements
    element_lines = []
    for i, el in enumerate(accessibility_tree[:45]): # Top 45 interactive elements
        tag = el.get('tag', '')
        role = el.get('role', '')
        text = el.get('text', '')
        selector = el.get('selector', '')
        bounds = el.get('bounds', {})
        element_lines.append(
            f"[{i+1}] <{tag}> role='{role}' text='{text}' selector='{selector}' at ({bounds.get('x',0)}, {bounds.get('y',0)})"
        )
    
    elements_str = "\n".join(element_lines) if element_lines else "No interactive elements detected."

    # Format redactions
    redact_lines = []
    for r in redaction_log:
        if isinstance(r, dict):
            token = r.get('token', '')
            method = r.get('method', '')
            bounds = r.get('bounds', {})
            redact_lines.append(f"- Token {token} ({method}) at ({bounds.get('x',0)}, {bounds.get('y',0)})")
        else:
            redact_lines.append(f"- Token {r.token} ({r.method})")
    
    redactions_str = "\n".join(redact_lines) if redact_lines else "No sensitive PII detected on current screen."

    # Format previous actions
    prev_lines = []
    for a in previous_actions[-4:]:
        cmd = a.get('command', {})
        act = cmd.get('action', '')
        sel = cmd.get('selector', '')
        prev_lines.append(f"Step {a.get('iteration', 1)}: {act.upper()} {sel}")
    prev_str = "\n".join(prev_lines) if prev_lines else "None (Initial Step)"

    return f"""## USER GOAL:
{goal}

## CURRENT SESSION STATE:
- Step: {iteration} of 10
- Previous Actions:
{prev_str}

## REDACTED SENSITIVE REGIONS ON SCREEN (Sanitized):
{redactions_str}

## INTERACTIVE DOM ELEMENTS:
{elements_str}

## INSTRUCTIONS:
Analyze the attached sanitized screenshot and the interactive element tree above.
Determine the single best next action to advance toward achieving the user goal.
Output your decision as a valid JSON object.
"""
