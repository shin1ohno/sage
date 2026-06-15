#!/usr/bin/env bash
# Parity harness driver — TS ⇄ Rust JSON diff for deterministic MCP tools.
# Phase 0: placeholder. Phase 1 wires the real TS (node ../../dist/index.js) vs
# Rust (cargo run -p sage-server) stdio round-trips and diffs tool results.
set -euo pipefail

echo "parity harness: not yet implemented (Phase 0 scaffold)" >&2
echo "Phase 1 will: (1) start TS + Rust stdio servers, (2) replay vectors/*.json," >&2
echo "              (3) diff JSON tool results, (4) exit non-zero on any diff." >&2
exit 0
