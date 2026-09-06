"""
SIH 2026 - Problem Statement 26171 (ISRO)
Cybersecurity Defense Layer: Anti-Prompt Injection, Action Sandbox & Replay Protection
"""

import re
import time
from typing import Dict, Any, List, Tuple
from agent.action_schema import ActionCommand, ActionType

# ── 1. Prompt Injection & Adversarial Jailbreak Patterns ──
PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions", re.IGNORECASE),
    re.compile(r"system\s*:\s*you\s+are", re.IGNORECASE),
    re.compile(r"disregard\s+(?:the\s+)?rules", re.IGNORECASE),
    re.compile(r"override\s+(?:safety|system)\s+prompt", re.IGNORECASE),
    re.compile(r"act\s+as\s+(?:DAN|an\s+unrestricted|root)", re.IGNORECASE),
    re.compile(r"<\s*script[^>]*>", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"data\s*:\s*text\/html", re.IGNORECASE),
    re.compile(r"base64\s*,", re.IGNORECASE)
]

# ── 2. High-Risk / Destructive Action Target Keywords ──
DESTRUCTIVE_KEYWORDS = [
    "delete account", "delete my profile", "erase all data", 
    "transfer all funds", "confirm payment", "send money to", 
    "format drive", "factory reset", "authorize transaction"
]

# ── 3. Disallowed Navigation Protocols ──
DANGEROUS_PROTOCOLS = ["javascript:", "data:", "file:", "chrome:", "about:", "vbscript:"]

class SecurityGuard:
    def __init__(self):
        # Nonce tracking for replay attack defense (client_id -> set of nonces with timestamps)
        self.seen_nonces: Dict[str, float] = {}
        # Rate limiting: client_id -> list of request timestamps
        self.request_timestamps: Dict[str, List[float]] = {}
        self.max_requests_per_window = 12
        self.rate_window_sec = 6.0

    def verify_timestamp_and_nonce(self, timestamp_ms: int, nonce: str) -> Tuple[bool, str]:
        """
        Guards against replay attacks & stale out-of-order network frames
        """
        now_ms = time.time() * 1000
        # Reject packets older than 35 seconds or from the future (>5s)
        if abs(now_ms - timestamp_ms) > 35000:
            return False, "Payload timestamp expired or clock out of sync (>35s difference)"

        # Check nonce uniqueness
        if nonce in self.seen_nonces:
            return False, "Replay attack detected: duplicate nonce detected"

        self.seen_nonces[nonce] = now_ms

        # Clean expired nonces older than 60s
        cutoff = now_ms - 60000
        self.seen_nonces = {k: v for k, v in self.seen_nonces.items() if v > cutoff}

        return True, "Valid"

    def check_rate_limit(self, client_id: str) -> Tuple[bool, str]:
        """
        Token-bucket rate limiter: Prevents denial-of-service and runaway client loops
        """
        now = time.time()
        if client_id not in self.request_timestamps:
            self.request_timestamps[client_id] = []

        # Filter out timestamps outside window
        window_start = now - self.rate_window_sec
        self.request_timestamps[client_id] = [
            t for t in self.request_timestamps[client_id] if t > window_start
        ]

        if len(self.request_timestamps[client_id]) >= self.max_requests_per_window:
            return False, f"Rate limit exceeded (Max {self.max_requests_per_window} requests per {self.rate_window_sec}s)"

        self.request_timestamps[client_id].append(now)
        return True, "Allowed"

    def sanitize_accessibility_tree(self, a11y_tree: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Strips adversarial prompt injections embedded in web page text/attributes
        """
        sanitized_tree = []
        for node in a11y_tree:
            raw_text = node.get("text", "")
            aria_label = node.get("ariaLabel", "")
            selector = node.get("selector", "")

            # Check for adversarial injection strings in webpage text
            is_malicious = False
            for pattern in PROMPT_INJECTION_PATTERNS:
                if pattern.search(raw_text) or pattern.search(aria_label or ""):
                    is_malicious = True
                    break

            if is_malicious:
                # Neutralize text
                node["text"] = "[SANITIZED_SUSPICIOUS_CONTENT]"
                if node.get("ariaLabel"):
                    node["ariaLabel"] = "[SANITIZED]"

            sanitized_tree.append(node)
        return sanitized_tree

    def validate_outgoing_action(self, action: ActionCommand) -> ActionCommand:
        """
        Action Sandbox: Validates and sanitizes outgoing commands before sending to client
        """
        # 1. Navigation Security
        if action.action == ActionType.NAVIGATE and action.url:
            url_clean = action.url.lower().strip()
            for proto in DANGEROUS_PROTOCOLS:
                if url_clean.startswith(proto):
                    print(f"[Security Guard] Blocked dangerous navigation attempt to '{action.url}'")
                    return ActionCommand(
                        action=ActionType.ERROR,
                        reasoning=f"Security sandbox blocked disallowed URI protocol ({proto})"
                    )

        # 2. Check for Destructive / High-Risk Action Triggers
        action_text = f"{action.reasoning or ''} {action.text or ''} {action.selector or ''}".lower()
        for kw in DESTRUCTIVE_KEYWORDS:
            if kw in action_text:
                print(f"[Security Guard] High-risk destructive keyword detected: '{kw}'")
                return ActionCommand(
                    action=ActionType.WAIT,
                    duration_ms=2000,
                    reasoning=f"High-risk action blocked by safety guardrail ({kw}). User manual confirmation required."
                )

        # 3. Vault Key Whitelist for fill_local
        if action.action == ActionType.FILL_LOCAL and action.local_data_key:
            allowed_keys = {"email", "phone", "fullName", "fullname", "aadhaar", "pan"}
            if action.local_data_key not in allowed_keys:
                print(f"[Security Guard] Disallowed local vault key: '{action.local_data_key}'")
                action.local_data_key = "email"

        return action

security_guard = SecurityGuard()
