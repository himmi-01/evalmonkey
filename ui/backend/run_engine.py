"""Run engine — orchestrates benchmark/chaos runs asynchronously.

This mirrors the CLI logic in scripts/cli.py but is designed to be
called from the FastAPI backend. Results are persisted to SQLite and
pushed to a per-run asyncio.Queue for SSE streaming to the frontend.
"""
from __future__ import annotations

import asyncio
import subprocess
import time
from datetime import datetime
from typing import Dict, Optional

from evalmonkey.evals.asset_generator import EvalAssetGenerator, FailingTrace, build_output_dir
from evalmonkey.evals.local_assets import load_local_evals
from evalmonkey.evals.runner import LLMJudgeProvider
from evalmonkey.reporting.history import record_run
from evalmonkey.scenarios.standard_benchmarks import load_standard_benchmark
from evalmonkey.simulator.load_gen import LoadGenerator

from .db import get_backend
from .schemas import RunRecord, SampleResult, StartBenchmarkRequest, StartChaosRequest

# ── Per-run event queues (run_id → asyncio.Queue) ────────────────────────────
_run_queues: Dict[str, asyncio.Queue] = {}


def get_queue(run_id: str) -> asyncio.Queue:
    if run_id not in _run_queues:
        _run_queues[run_id] = asyncio.Queue()
    return _run_queues[run_id]


def cleanup_queue(run_id: str) -> None:
    _run_queues.pop(run_id, None)


# ── Sample agent helpers ──────────────────────────────────────────────────────
def _start_sample_agent(name: str):
    if name == "rag_app":
        import os
        env = os.environ.copy()
        env["PYTHONPATH"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        proc = subprocess.Popen(
            ["python3.11", "apps/rag_app/app.py"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
        )
        time.sleep(3)
        return proc, "http://127.0.0.1:8001/solve"
    return None, None


# ── Core run coroutine ────────────────────────────────────────────────────────
async def execute_run(run_id: str, req: StartBenchmarkRequest, chaos_profile: Optional[str] = None) -> None:
    """Background coroutine that runs a full benchmark and streams events."""
    db = get_backend()
    queue = get_queue(run_id)
    agent_process = None

    try:
        # ── Resolve target URL ────────────────────────────────────────────────
        effective_url = req.target_url
        if req.use_sample_agent:
            agent_process, effective_url = await asyncio.to_thread(_start_sample_agent, "rag_app")
            if not effective_url:
                raise ValueError("Failed to start sample agent")

        await queue.put({"type": "status", "message": f"Loading {req.scenario} benchmark..."})

        # ── Load benchmark scenarios ──────────────────────────────────────────
        scenarios = await asyncio.to_thread(load_standard_benchmark, req.scenario, req.limit)

        if not scenarios:
            # Try local evals
            evals = load_local_evals("custom_evals.yaml")
            target = next((e for e in evals if e.id == req.scenario), None)
            if target:
                scenarios = [target]

        if not scenarios:
            raise ValueError(f"No scenarios found for benchmark: {req.scenario}")

        sample_count = len(scenarios)
        db.update_run(run_id, sample_count=sample_count)
        await queue.put({"type": "start", "sample_count": sample_count})

        # ── Run each sample ───────────────────────────────────────────────────
        generator = LoadGenerator(effective_url, request_key=req.request_key, response_path=req.response_path)
        judge = LLMJudgeProvider(model_name=req.eval_model)
        asset_gen = EvalAssetGenerator(model_name=req.eval_model)
        scores = []
        first_reasoning = ""

        for idx, eval_task in enumerate(scenarios):
            await queue.put({"type": "progress", "index": idx, "total": sample_count, "message": f"Running sample {idx + 1}/{sample_count}..."})

            # Fire request to agent
            resp = await generator.run_scenario(req.scenario, eval_task.input_payload, chaos_profile=chaos_profile)
            agent_output = str(resp.get("data", resp.get("error_message", "No output")))

            # Score with LLM judge (sync → thread)
            evaluation = await asyncio.to_thread(judge.score_run, eval_task.expected_behavior_rubric, agent_output)
            score = evaluation.get("score", 0)
            reasoning = evaluation.get("reasoning", "")
            scores.append(score)
            if idx == 0:
                first_reasoning = reasoning

            # Persist sample result
            sample = SampleResult(
                run_id=run_id,
                sample_index=idx,
                eval_id=eval_task.id,
                question=str(eval_task.input_payload.get("question", str(eval_task.input_payload)))[:2000],
                agent_output=agent_output[:2000],
                expected_rubric=eval_task.expected_behavior_rubric[:1000],
                score=score,
                reasoning=reasoning[:1000],
                chaos_profile=chaos_profile,
            )
            db.save_sample(sample)
            db.update_run(run_id, completed_samples=idx + 1)

            # Record failure for asset generation
            asset_gen.record_failure(FailingTrace(
                scenario=req.scenario,
                eval_id=eval_task.id,
                input_payload=eval_task.input_payload,
                agent_output=agent_output,
                expected_rubric=eval_task.expected_behavior_rubric,
                score=score,
                reasoning=reasoning,
                chaos_profile=chaos_profile,
            ))

            current_avg = int(sum(scores) / len(scores))
            await queue.put({
                "type": "sample",
                "index": idx,
                "eval_id": eval_task.id,
                "question": sample.question,
                "agent_output": sample.agent_output,
                "expected_rubric": sample.expected_rubric,
                "score": score,
                "reasoning": reasoning,
                "current_score": current_avg,
            })

        # ── Finalize ──────────────────────────────────────────────────────────
        final_score = int(sum(scores) / len(scores)) if scores else 0
        run_type = "chaos" if chaos_profile else "baseline"

        # Persist to CLI history for continuity
        record_run(req.scenario, run_type, final_score, details={"reasoning": first_reasoning, "sample_size": len(scores)})

        # Save failure assets if needed
        output_path = None
        if asset_gen.has_failures:
            output_dir = build_output_dir(req.scenario if not chaos_profile else f"{req.scenario}_{chaos_profile}")
            output_path = await asyncio.to_thread(asset_gen.save, output_dir)

        db.update_run(
            run_id,
            status="completed",
            score=final_score,
            completed_at=datetime.now().isoformat(),
            details={"reasoning": first_reasoning, "output_path": output_path, "failure_count": asset_gen.failure_count},
        )

        await queue.put({
            "type": "complete",
            "final_score": final_score,
            "failure_count": asset_gen.failure_count,
            "output_path": output_path,
        })

    except Exception as e:
        db.update_run(run_id, status="failed", completed_at=datetime.now().isoformat(), details={"error": str(e)})
        await queue.put({"type": "error", "message": str(e)})
    finally:
        if agent_process:
            agent_process.terminate()
        # Keep queue alive briefly for final reads then clean up
        await asyncio.sleep(30)
        cleanup_queue(run_id)
