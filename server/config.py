"""
SIH 2026 - Problem Statement 26171 (ISRO)
Server Configuration Module
"""

import os
from pydantic import BaseModel

class ServerSettings(BaseModel):
    # Host & Port
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # VLM Inference Providers
    # Options: "groq", "vllm", "openai", "heuristic_fallback"
    VLM_PROVIDER: str = os.getenv("VLM_PROVIDER", "auto")
    
    # Groq API Configuration (Fast LPU inference for SIH demo)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.2-11b-vision-preview")
    
    # Local / Cloud vLLM Configuration (Qwen2.5-VL-7B)
    VLLM_BASE_URL: str = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
    VLLM_MODEL: str = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")
    
    # OpenAI API Configuration (Alternative)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    # Execution Guardrails
    MAX_STEPS_PER_SESSION: int = 10
    ACTION_TIMEOUT_SEC: float = 30.0
    ENABLE_SECURITY_FILTER: bool = True

settings = ServerSettings()
