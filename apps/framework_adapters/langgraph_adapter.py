"""
EvalMonkey Adapter: LangGraph
====================================
Wraps any LangGraph state graph in a FastAPI endpoint so EvalMonkey
can fire benchmark payloads and chaos injections against it.

Install deps:
    pip install langgraph langchain-openai fastapi uvicorn

Usage:
    python langgraph_adapter.py
    evalmonkey run-benchmark --scenario mmlu --target-url http://localhost:8012/solve
"""
import os
import uvicorn
from fastapi import FastAPI, Request
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI

app = FastAPI(title="EvalMonkey LangGraph Adapter")

# ---------------------------------------------------
# Build your LangGraph here
# ---------------------------------------------------
class State(TypedDict):
    messages: Annotated[list, add_messages]

llm = ChatOpenAI(model=os.getenv("EVAL_MODEL", "gpt-4o"), temperature=0)

def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}

graph_builder = StateGraph(State)
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_edge(START, "chatbot")
graph_builder.add_edge("chatbot", END)
graph = graph_builder.compile()

@app.post("/solve")
async def solve(request: Request):
    payload = await request.json()
    question = payload.get("question", payload.get("prompt", ""))

    try:
        # Pass the question to your compiled LangGraph
        initial_state = {"messages": [("user", question)]}
        result = graph.invoke(initial_state)
        
        # Extract the final AI message
        final_answer = result["messages"][-1].content
        return {"status": "success", "data": final_answer}
    except Exception as e:
        return {"status": "error", "error_message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8012)
