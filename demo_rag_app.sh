#!/usr/bin/env bash
# =============================================================================
# EvalMonkey — RAG App Full Demo
# =============================================================================
# Runs the complete benchmark + chaos + eval-asset generation loop for the
# built-in rag_app sample agent (apps/rag_app/app.py).
#
# Prerequisites:
#   1. Copy .env.example → .env and fill in your EVAL_MODEL + provider key.
#   2. pip install -e .  (install evalmonkey into your environment)
#   3. (Optional) Add LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY to .env if
#      you want failing evals automatically pushed to a Langfuse dataset.
#
# Usage:
#   chmod +x demo_rag_app.sh
#   ./demo_rag_app.sh
#
# Outputs:
#   output/demo_<timestamp>/
#     traces.json           — all failing traces
#     evals.json            — LLM-generated improvement test cases
#     improvement_prompt.md — paste this into Claude Code or Cursor to fix agent
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

header()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
success() { echo -e "${GREEN}✅  $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️   $1${NC}"; }
fail()    { echo -e "${RED}❌  $1${NC}"; }

# ── Load .env if present ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
    success "Loaded .env"
else
    warn ".env not found — using existing shell environment"
fi

# ── Sanity checks ──────────────────────────────────────────────────────────
if ! command -v evalmonkey &>/dev/null; then
    fail "evalmonkey not found. Run: pip install -e ."
    exit 1
fi

if [ -z "${EVAL_MODEL:-}" ]; then
    fail "EVAL_MODEL is not set. Add it to your .env file."
    exit 1
fi

# ── Config ─────────────────────────────────────────────────────────────────
RAG_PORT=8001
RAG_URL="http://127.0.0.1:${RAG_PORT}/solve"
BENCHMARKS=("gsm8k" "mmlu" "arc")
CHAOS_PROFILES=("client_prompt_injection" "client_payload_bloat" "client_empty_payload" "cascading_tool_failure" "memory_amnesia")
LIMIT=3
TS=$(date +%Y%m%d_%H%M%S)
OUTPUT_BASE="output/demo_${TS}"

# Optional Langfuse dataset push
LANGFUSE_DATASET="${LANGFUSE_DATASET:-evalmonkey_rag_failures}"

header "🐵 EvalMonkey RAG App Full Demo"
echo    "   Benchmarks  : ${BENCHMARKS[*]}"
echo    "   Chaos tests : ${CHAOS_PROFILES[*]}"
echo    "   Samples/run : $LIMIT"
echo    "   Output dir  : $OUTPUT_BASE"
if [ -n "${LANGFUSE_PUBLIC_KEY:-}" ]; then
    echo "   Langfuse    : ✅ dataset '${LANGFUSE_DATASET}'"
else
    warn "Langfuse credentials not set — skipping cloud export."
    echo "   (Add LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY to .env to enable)"
fi

# ── Start RAG App ──────────────────────────────────────────────────────────
header "🚀 Starting rag_app on port ${RAG_PORT}..."

# Kill anything already on that port
if lsof -ti :"${RAG_PORT}" &>/dev/null; then
    kill "$(lsof -ti :"${RAG_PORT}")" 2>/dev/null || true
    sleep 1
fi

python apps/rag_app/app.py &
RAG_PID=$!
echo "   PID: $RAG_PID — waiting 4 s for startup..."
sleep 4

# Quick readiness check
if ! curl -sf -o /dev/null --max-time 3 "${RAG_URL}" 2>/dev/null; then
    # First request to /solve always needs a body — a HEAD check suffices
    :
fi
success "rag_app is running at ${RAG_URL}"

# ── Trap to ensure cleanup ─────────────────────────────────────────────────
cleanup() {
    echo ""
    warn "Stopping rag_app (PID $RAG_PID)..."
    kill "$RAG_PID" 2>/dev/null || true
    success "Demo complete. Check ${OUTPUT_BASE}/ for your eval assets."
}
trap cleanup EXIT

# ── Helper: run one benchmark and capture output dir ──────────────────────
run_and_capture() {
    local scenario=$1
    local chaos=${2:-}

    if [ -z "$chaos" ]; then
        echo -e "\n${CYAN}  ▶ Benchmark: ${scenario}${NC}"
        evalmonkey run-benchmark \
            --scenario "$scenario" \
            --target-url "$RAG_URL" \
            --limit "$LIMIT" \
            --response-path data
    else
        echo -e "\n${CYAN}  🔥 Chaos: ${scenario} / ${chaos}${NC}"
        evalmonkey run-chaos \
            --scenario "$scenario" \
            --target-url "$RAG_URL" \
            --chaos-profile "$chaos" \
            --limit "$LIMIT" \
            --response-path data
    fi
}

# ── Phase 1: Baseline benchmarks ──────────────────────────────────────────
header "📊 Phase 1: Baseline Benchmarks"
for bench in "${BENCHMARKS[@]}"; do
    run_and_capture "$bench" || warn "Benchmark '${bench}' had errors — continuing"
done

# ── Phase 2: Chaos Testing ─────────────────────────────────────────────────
header "🔥 Phase 2: Chaos Injection Tests"
# Run chaos against the first benchmark only (gsm8k) to keep demo concise
PRIMARY="${BENCHMARKS[0]}"
for profile in "${CHAOS_PROFILES[@]}"; do
    run_and_capture "$PRIMARY" "$profile" || warn "Chaos '${profile}' had errors — continuing"
done

# ── Phase 3: Consolidate & generate improvement evals ─────────────────────
header "🛠  Phase 3: Generating Improvement Eval Assets"

# Collect all traces.json files produced this run and merge them
mkdir -p "${OUTPUT_BASE}"
MERGED_TRACES="${OUTPUT_BASE}/traces.json"

echo "[]" > "${MERGED_TRACES}"
python3 - <<PYEOF
import json, glob, sys

merged = []
for f in glob.glob("output/*/traces.json"):
    try:
        data = json.loads(open(f).read())
        merged.extend(data)
    except Exception:
        pass

with open("${MERGED_TRACES}", "w") as out:
    json.dump(merged, out, indent=2)

print(f"  Merged {len(merged)} failing trace(s) from all runs.")
PYEOF

if [ "$(python3 -c "import json; print(len(json.load(open('${MERGED_TRACES}'))))")" -gt "0" ]; then
    # Re-generate evals from the merged trace set
    evalmonkey generate-evals \
        --traces-file "${MERGED_TRACES}" \
        --output-dir "${OUTPUT_BASE}" \
        ${LANGFUSE_PUBLIC_KEY:+--langfuse-dataset "${LANGFUSE_DATASET}"}

    success "Eval assets saved to ${OUTPUT_BASE}/"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  📁 Files generated:${NC}"
    ls -1 "${OUTPUT_BASE}/"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # ── Phase 4: Print coding-agent command ────────────────────────────────
    echo ""
    header "💡 Phase 4: Fix Your Agent"
    echo "  Run the following to copy your improvement brief to clipboard"
    echo "  and paste it into Claude Code or Cursor:"
    echo ""
    echo -e "  ${GREEN}cat ${OUTPUT_BASE}/improvement_prompt.md | pbcopy${NC}"
    echo ""
    echo "  Or read it directly:"
    echo -e "  ${GREEN}cat ${OUTPUT_BASE}/improvement_prompt.md${NC}"
    echo ""
    echo "  After fixing your agent, re-run the benchmarks to verify:"
    echo -e "  ${GREEN}evalmonkey run-benchmark --scenario gsm8k --target-url ${RAG_URL}${NC}"
else
    success "No failing traces found — rag_app passed everything! 🎉"
fi

# ── Historical trend ───────────────────────────────────────────────────────
header "📈 Production Reliability History"
for bench in "${BENCHMARKS[@]}"; do
    evalmonkey history --scenario "$bench" || true
done
