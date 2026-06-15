# Parity harness — TS ⇄ Rust conformance oracle

The TypeScript implementation (`../../src`) is the behavior-parity oracle for the
Rust rewrite. This harness keeps the two honest during migration.

## Two layers

1. **Deterministic-logic vectors** (`vectors/`): JSON test vectors extracted from
   the TS unit tests for the pure engines — `analyze_tasks`, `get_working_cadence`,
   `list_todos` (offline), priority, estimation, stakeholders, task-splitter,
   recurrence-validator. Each vector is `{ input, expected }`. The Rust crates
   replay these in `#[test]`s and assert byte-equal JSON. Phase 1 populates this.

2. **Live diff** (`run.sh`, Phase 1+): feed identical inputs to the TS tool
   (`node ../../dist/index.js` over stdio) and the Rust binary
   (`cargo run -p sage-server`) and `diff` the JSON tool results. Zero diff on the
   deterministic tools is a CI gate.

## Watch-outs encoded as vectors (from research)

- **CJK regex divergence**: Rust `regex` `\w` is Unicode by default; the TS uses
  ASCII `\w`. Stakeholder/mention vectors must include CJK names so the Rust port
  proves it used `(?-u)` / `[\x{4E00}-\x{9FAF}]` correctly.
- **Estimation config divergence**: runtime uses `config.ts` values
  (simple=25/medium=50/complex=90/project=180), NOT the `estimation.ts` constants.
- **Deadline `<=`**: overdue tasks count as matching the deadline condition.
- **Double-round**: estimation rounds to 25-min twice (benign); keep the snap.

## Status

Phase 0: skeleton only. Vector extraction + `run.sh` land in Phase 1 alongside
the first real `sage-domain` ports.
