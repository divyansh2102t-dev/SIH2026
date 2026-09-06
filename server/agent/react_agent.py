"""
SIH 2026 - Problem Statement 26171 (ISRO)
Stateful ReAct Agent with Integrated Cybersecurity Defenses
"""

import re
from typing import Dict, Any, List
from config import settings
from agent.action_schema import SanitizedClientPayload, ActionCommand, ActionType
from agent.security_guard import security_guard
from vlm.vlm_client import vlm_client

# Indian PII regex patterns for outgoing action security filtering
SENSITIVE_PATTERNS = [
    re.compile(r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b"),  # Aadhaar
    re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),          # PAN
    re.compile(r"\b(?:\+91)?[6-9]\d{9}\b"),          # Mobile
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b") # Email
]

class ReActBrowserAgent:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: List[Dict[str, Any]] = []

    async def process_step(self, payload: SanitizedClientPayload) -> ActionCommand:
        """
        Processes a single sanitized screen observation step with security verification
        """
        iteration = payload.iteration
        print(f"[ReAct Agent] Session {self.session_id} - Processing Step {iteration} for goal: '{payload.userGoal}'")

        # 1. Enforce Max Steps Guardrail
        if iteration > settings.MAX_STEPS_PER_SESSION:
            return ActionCommand(
                action=ActionType.DONE,
                summary="Session capped at max iteration limit (10 steps).",
                reasoning="Safety guardrail triggered to prevent infinite loops."
            )

        # 2. Cybersecurity: Sanitize accessibility tree from prompt injections
        sanitized_a11y_tree = security_guard.sanitize_accessibility_tree(payload.accessibilityTree)

        # 3. Invoke VLM / Structural Reasoner
        raw_action = await vlm_client.infer_next_action(
            goal=payload.userGoal,
            redacted_screenshot_b64=payload.redactedScreenshot,
            accessibility_tree=sanitized_a11y_tree,
            redaction_log=payload.redactionLog,
            previous_actions=payload.previousActions,
            iteration=iteration
        )

        # 4. Cybersecurity Sandbox Validation
        action_command = security_guard.validate_outgoing_action(raw_action)

        # 5. Security Filter: Prevent server from echoing raw PII into 'type' commands
        if settings.ENABLE_SECURITY_FILTER and action_command.action == ActionType.TYPE:
            text_to_type = action_command.text or ""
            for pattern in SENSITIVE_PATTERNS:
                if pattern.search(text_to_type):
                    print(f"[Security Guardrail] Converted raw PII text to zero-trust local vault fill")
                    return ActionCommand(
                        action=ActionType.FILL_LOCAL,
                        selector=action_command.selector,
                        local_data_key="email",
                        reasoning="Security filter converted raw PII to zero-trust local vault fill"
                    )

        self.history.append({
            "iteration": iteration,
            "command": action_command.model_dump()
        })

        return action_command
