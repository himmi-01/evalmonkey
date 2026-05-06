"""Pydantic schemas for EvalMonkey UI API."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RunRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scenario: str
    run_type: str  # 'baseline' | 'chaos'
    status: str = "running"  # 'running' | 'completed' | 'failed'
    target_url: str
    eval_model: str = "gpt-4o"
    request_key: str = "question"
    response_path: str = "data"
    chaos_profile: Optional[str] = None
    score: Optional[int] = None
    sample_count: int = 0
    completed_samples: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    details: Dict[str, Any] = {}


class SampleResult(BaseModel):
    id: Optional[int] = None
    run_id: str
    sample_index: int
    eval_id: str
    question: str
    agent_output: Optional[str] = None
    expected_rubric: Optional[str] = None
    score: Optional[int] = None
    reasoning: Optional[str] = None
    chaos_profile: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class StartBenchmarkRequest(BaseModel):
    scenario: str
    target_url: str
    eval_model: str = "gpt-4o"
    request_key: str = "question"
    response_path: str = "data"
    limit: int = 5
    use_sample_agent: bool = False


class StartChaosRequest(StartBenchmarkRequest):
    chaos_profile: str


class BenchmarkInfo(BaseModel):
    id: str
    description: str
    category: str


class RunSummary(BaseModel):
    id: str
    scenario: str
    run_type: str
    status: str
    score: Optional[int]
    sample_count: int
    completed_samples: int
    eval_model: str
    chaos_profile: Optional[str]
    created_at: str
    completed_at: Optional[str]
    target_url: str
