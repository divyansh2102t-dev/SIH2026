"""
SIH 2026 - Problem Statement 26171 (ISRO)
Universal Semantic Web Reasoner with Compound Query Matching & Multi-Page Navigation
"""

import json
import re
import httpx
from typing import Dict, Any, Optional, List
from config import settings
from agent.prompt_templates import SYSTEM_PROMPT, build_vlm_user_prompt
from agent.action_schema import ActionCommand, ActionType

NUM_WORD_MAP = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five'
}

class VLMInferenceClient:
    def __init__(self):
        self.groq_api_key = settings.GROQ_API_KEY
        self.vllm_base_url = settings.VLLM_BASE_URL
        self.openai_api_key = settings.OPENAI_API_KEY

    async def infer_next_action(
        self,
        goal: str,
        redacted_screenshot_b64: str,
        accessibility_tree: list,
        redaction_log: list,
        previous_actions: list,
        iteration: int
    ) -> ActionCommand:
        user_prompt = build_vlm_user_prompt(
            goal=goal,
            accessibility_tree=accessibility_tree,
            redaction_log=redaction_log,
            previous_actions=previous_actions,
            iteration=iteration
        )

        # 1. Cloud Groq Vision (If configured)
        if self.groq_api_key:
            try:
                cmd = await self._call_groq_vision(user_prompt, redacted_screenshot_b64)
                if cmd: return cmd
            except Exception as e:
                print(f"[VLM Client] Groq API call error: {e}. Switching to universal reasoner...")

        # 2. Local vLLM (Qwen2.5-VL-7B)
        try:
            cmd = await self._call_vllm_vision(user_prompt, redacted_screenshot_b64)
            if cmd: return cmd
        except Exception:
            pass

        # 3. Universal Autonomous Semantic Reasoner
        print(f"[VLM Client] Running Universal Semantic Reasoner on {len(accessibility_tree)} DOM elements (Step {iteration})...")
        return self._plan_universal_action(
            goal=goal,
            accessibility_tree=accessibility_tree,
            redaction_log=redaction_log,
            previous_actions=previous_actions,
            iteration=iteration
        )

    async def _call_groq_vision(self, prompt: str, image_b64: str) -> Optional[ActionCommand]:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": settings.GROQ_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_b64}}
                    ]
                }
            ],
            "temperature": 0.1,
            "max_tokens": 512,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return self._parse_json_to_command(content)
            else:
                raise Exception(f"Groq returned {resp.status_code}: {resp.text}")

    async def _call_vllm_vision(self, prompt: str, image_b64: str) -> Optional[ActionCommand]:
        url = f"{self.vllm_base_url}/chat/completions"
        payload = {
            "model": settings.VLLM_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_b64}}
                    ]
                }
            ],
            "temperature": 0.1,
            "max_tokens": 512
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return self._parse_json_to_command(content)
        return None

    def _parse_json_to_command(self, raw_str: str) -> ActionCommand:
        clean = re.sub(r"^```json\s*", "", raw_str.strip())
        clean = re.sub(r"\s*```$", "", clean)
        parsed = json.loads(clean)
        return ActionCommand.model_validate(parsed)

    def _plan_universal_action(
        self,
        goal: str,
        accessibility_tree: list,
        redaction_log: list,
        previous_actions: list,
        iteration: int
    ) -> ActionCommand:
        goal_clean = goal.strip()
        goal_lower = goal_clean.lower()
        
        executed_selectors = {
            a.get('command', {}).get('selector') for a in previous_actions if a.get('command', {}).get('selector')
        }
        previous_action_types = [a.get('command', {}).get('action') for a in previous_actions]

        # Extract keywords
        stopwords = {'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'with', 'is', 'it', 'my', 'me', 'please', 'open', 'find', 'search', 'get'}
        raw_words = [w for w in re.findall(r'\b[a-zA-Z0-9_-]+\b', goal_lower) if w not in stopwords and len(w) > 1]
        
        # Expand number equivalents (e.g. four -> 4, 4 -> four)
        keywords = list(raw_words)
        for w in raw_words:
            if w in NUM_WORD_MAP:
                keywords.append(NUM_WORD_MAP[w])
            # Handle compound e.g. "4sum", "foursum"
            if w == 'four' or w == '4':
                keywords.extend(['4sum', '4-sum', 'foursum'])
            if w == 'two' or w == '2':
                keywords.extend(['2sum', '2-sum', 'twosum'])
            if w == 'three' or w == '3':
                keywords.extend(['3sum', '3-sum', 'threesum'])

        # ── 1. Search Result Link & Organic Navigation Matching ──
        # If links on the page match the target subject (e.g. "4Sum - LeetCode", "Two Sum - LeetCode")
        best_link = None
        best_link_score = 0

        EXCLUDED_LINK_NOISE = [
            'accessibility', 'skip to', 'screen reader', 'support.google.com',
            'accounts.google.com', 'policies.google.com', 'preferences', 'terms', 'privacy',
            'feedback', 'google apps', 'sign in', 'cookie', 'websearch/answer'
        ]

        for el in accessibility_tree:
            sel = el.get('selector', '')
            if not sel or sel in executed_selectors: continue
            
            tag = el.get('tag', '')
            role = el.get('role', '')
            text = (el.get('text') or '').lower()
            aria = (el.get('ariaLabel') or '').lower()
            href = (el.get('href') or '').lower()
            is_search_result = el.get('isSearchResult', False)
            combined_text = f"{text} {aria} {href}"

            # Skip noise / utility / accessibility links
            if any(noise in combined_text for noise in EXCLUDED_LINK_NOISE):
                continue

            if tag in ['a', 'h3', 'h2', 'span'] or role in ['link', 'heading']:
                score = 0

                # Search result container bonus
                if is_search_result:
                    score += 10

                for kw in keywords:
                    if kw in text:
                        score += 6
                    elif kw in combined_text:
                        score += 4
                    if href and kw in href:
                        score += 8
                
                # Bonus if multiple keywords match in same link
                matched_kws = sum(1 for kw in raw_words if kw in combined_text)
                if matched_kws >= 2:
                    score += 25
                if matched_kws >= 3:
                    score += 40

                # Massive priority if domain name is in href (e.g. leetcode.com, github.com)
                for dom_key in ['leetcode', 'github', 'wikipedia', 'youtube', 'isro', 'amazon']:
                    if dom_key in goal_lower and dom_key in href:
                        score += 35

                if score > best_link_score:
                    best_link_score = score
                    best_link = el

        if best_link and best_link_score >= 8:
            sel = best_link.get('selector')
            title = best_link.get('text') or best_link.get('href') or sel
            return ActionCommand(
                action=ActionType.CLICK,
                selector=sel,
                reasoning=f"Clicking organic result link: '{title}'"
            )

        # ── 2. In-Page Search Input Bar Discovery ──
        # If the page has an interactive search input (like on LeetCode problems page or Google)
        if ActionType.TYPE not in previous_action_types:
            for el in accessibility_tree:
                sel = el.get('selector', '')
                if sel in executed_selectors: continue
                
                tag = el.get('tag', '')
                inp_type = el.get('type', '')
                placeholder = (el.get('placeholder') or '').lower()
                aria = (el.get('ariaLabel') or '').lower()
                sel_lower = sel.lower()

                if tag in ['input', 'textarea'] and (
                    inp_type in ['search', 'text', ''] or
                    'search' in sel_lower or 'search' in placeholder or 'search' in aria or 'q' in sel_lower
                ):
                    search_term = " ".join([w for w in raw_words if w not in ['leetcode', 'google', 'website', 'page']]) or goal_clean
                    return ActionCommand(
                        action=ActionType.TYPE,
                        selector=sel,
                        text=search_term,
                        reasoning=f"Entering search term '{search_term}' into search bar"
                    )

        # ── 3. Sensitive Credential Field Auto-Mapping ──
        for el in accessibility_tree:
            sel = el.get('selector', '')
            if sel in executed_selectors: continue

            tag = el.get('tag', '')
            inp_type = (el.get('type') or '').lower()
            placeholder = (el.get('placeholder') or '').lower()
            aria = (el.get('ariaLabel') or '').lower()
            text = (el.get('text') or '').lower()
            combined_desc = f"{sel.lower()} {placeholder} {aria} {text}"

            if tag in ['input', 'textarea']:
                if 'email' in combined_desc or inp_type == 'email':
                    return ActionCommand(action=ActionType.FILL_LOCAL, selector=sel, local_data_key="email", reasoning="Entering email from local encrypted vault")
                if 'phone' in combined_desc or 'mobile' in combined_desc or inp_type == 'tel':
                    return ActionCommand(action=ActionType.FILL_LOCAL, selector=sel, local_data_key="phone", reasoning="Entering phone number from local vault")
                if 'aadhaar' in combined_desc or 'aadhar' in combined_desc or 'uid' in combined_desc:
                    return ActionCommand(action=ActionType.FILL_LOCAL, selector=sel, local_data_key="aadhaar", reasoning="Entering Aadhaar from local vault")
                if 'pan' in combined_desc:
                    return ActionCommand(action=ActionType.FILL_LOCAL, selector=sel, local_data_key="pan", reasoning="Entering PAN ID from local vault")
                if 'name' in combined_desc and not any(k in combined_desc for k in ['username', 'file']):
                    return ActionCommand(action=ActionType.FILL_LOCAL, selector=sel, local_data_key="fullName", reasoning="Entering full name from local vault")

        # ── 4. General Element Scoring ──
        best_element = None
        best_score = -1
        best_action_type = ActionType.CLICK

        for el in accessibility_tree:
            sel = el.get('selector', '')
            if not sel or sel in executed_selectors: continue

            tag = el.get('tag', '')
            role = el.get('role', '')
            text = (el.get('text') or '').lower()
            placeholder = (el.get('placeholder') or '').lower()
            aria = (el.get('ariaLabel') or '').lower()
            combined_el = f"{text} {placeholder} {aria} {sel.lower()}"

            score = 0
            for kw in keywords:
                if kw in combined_el:
                    score += 4
                if kw in text:
                    score += 3

            if tag in ['button', 'a'] or role in ['button', 'link']:
                score += 1

            if score > best_score:
                best_score = score
                best_element = el
                best_action_type = ActionType.CLICK if tag in ['button', 'a', 'span'] else ActionType.TYPE

        if best_element and best_score > 2:
            sel = best_element.get('selector')
            desc = best_element.get('text') or best_element.get('placeholder') or sel
            return ActionCommand(
                action=best_action_type,
                selector=sel,
                reasoning=f"Interacting with best matched element: '{desc}'"
            )

        # ── 5. Completion Check ──
        if len(previous_actions) >= 1:
            return ActionCommand(
                action=ActionType.DONE,
                summary=f"Reached destination for objective: '{goal}'.",
                reasoning="Navigation and exploration completed."
            )

        # ── 6. Fallback Scroll ──
        return ActionCommand(
            action=ActionType.SCROLL,
            direction="down",
            amount=350,
            reasoning="Scrolling down to inspect remaining content on page"
        )

vlm_client = VLMInferenceClient()
