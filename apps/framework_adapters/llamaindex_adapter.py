"""
EvalMonkey Adapter: LlamaIndex Agent
====================================
Wraps any LlamaIndex query engine or agent in a FastAPI endpoint so EvalMonkey
can fire benchmark payloads and chaos injections against it.

Install deps:
    pip install llama-index fastapi uvicorn

Usage:
    python llamaindex_adapter.py
    evalmonkey run-benchmark --scenario mmlu --target-url http://localhost:8011/solve
"""
import os
import uvicorn
from fastapi import FastAPI, Request
from llama_index.core import VectorStoreIndex, Document
from llama_index.core.agent import ReActAgent
from llama_index.llms.openai import OpenAI

app = FastAPI(title="EvalMonkey LlamaIndex Adapter")

# ---------------------------------------------------
# Build your LlamaIndex agent or query engine here
# ---------------------------------------------------
llm = OpenAI(model=os.getenv("EVAL_MODEL", "gpt-4o"), temperature=0)

# Dummy agent setup for demonstration
documents = [Document(text="EvalMonkey is a great benchmarking framework for testing AI agents.")]
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine(llm=llm)

@app.post("/solve")
async def solve(request: Request):
    payload = await request.json()
    question = payload.get("question", payload.get("prompt", ""))

    try:
        # Pass the question to your query engine or agent
        response = query_engine.query(question)
        return {"status": "success", "data": str(response)}
    except Exception as e:
        return {"status": "error", "error_message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8011)
