"""
EvalMonkey Adapter: Pydantic AI
====================================
Wraps a Pydantic AI Agent in a FastAPI endpoint so EvalMonkey
can fire benchmark payloads and chaos injections against it.

Install deps:
    pip install pydantic-ai fastapi uvicorn

Usage:
    python pydantic_ai_adapter.py
    evalmonkey run-benchmark --scenario mmlu --target-url http://localhost:8013/solve
"""
import os
import uvicorn
from fastapi import FastAPI, Request
from pydantic_ai import Agent

app = FastAPI(title="EvalMonkey Pydantic AI Adapter")

# ---------------------------------------------------
# Build your Pydantic AI Agent here
# ---------------------------------------------------
# You can use 'openai:gpt-4o' or other providers supported by Pydantic AI
model_name = os.getenv("EVAL_MODEL", "openai:gpt-4o")
agent = Agent(
    model_name,
    system_prompt="You are a helpful AI assistant. Answer the user's questions clearly and concisely."
)

@app.post("/solve")
async def solve(request: Request):
    payload = await request.json()
    question = payload.get("question", payload.get("prompt", ""))

    try:
        # Pass the question to your Pydantic AI agent
        result = agent.run_sync(question)
        
        # result.data contains the validated response text
        return {"status": "success", "data": result.data}
    except Exception as e:
        return {"status": "error", "error_message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8013)
