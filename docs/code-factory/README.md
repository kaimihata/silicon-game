# Code factory design

**Status:** Early implementation design for a future autonomous game-production system.

This area describes how a multi-agent code factory could plan, implement, integrate, test, and playtest a game from human-authored specifications. Its architecture, protocol, orchestration, operations, control-plane, and verification contracts are intentionally independent of Chip City's rules, content, and eventual production engine. The specification-authoring playbook applies those contracts to Chip City.

The code factory is not intended to replace game design. Humans remain responsible for product direction, mechanics, interaction intent, aesthetic direction, constraints, and approval. The factory turns those decisions into traceable implementation tasks and evidence-backed builds.

## Goals

- Make a game playable through the same authoritative rules by humans and agents.
- Convert versioned specifications into a dependency-aware implementation plan.
- Let specialized workers produce code, assets, scenes, tests, and playtest results.
- Run useful work autonomously without allowing workers to silently change product intent.
- Require reproducible evidence before generated work is accepted.
- Preserve provenance for requirements, generated artifacts, decisions, and test results.
- Support long autonomous production periods between deliberate human direction and playtest checkpoints.
- Allow the system to begin as developer tooling and grow into a more autonomous service.

## Non-goals

- Generating game-design direction without human approval.
- Treating prose prompts as sufficient production specifications.
- Allowing several agents to edit one shared engine project concurrently.
- Using visual playtesting as the only correctness check.
- Coupling the architecture to one model vendor, game engine, or asset generator.
- Shipping test-only state access or privileged agent controls as player features.

## Core principles

### Specifications are source code

Game behavior, interaction contracts, content schemas, visual briefs, performance budgets, and acceptance scenarios must be versioned and reviewable. Agents implement these specifications; they do not silently reinterpret them.

### One simulation, multiple adapters

Human controls, semantic-agent tools, test fixtures, replays, and accessibility surfaces must invoke the same validated player commands. The agent interface must not bypass game rules.

### Plans are dependency graphs

The orchestrator produces small tasks with declared inputs, outputs, dependencies, ownership, validation commands, and acceptance criteria. A chat transcript is not a task-management system.

### Workers produce candidates

Code, assets, scenes, and tests are candidate artifacts until an independent evaluator verifies them. The worker that creates an artifact cannot be its only judge.

### Integration has one owner

Workers operate in isolated workspaces or artifact staging areas. An integration agent serializes changes to shared scenes, project settings, generated registries, and other conflict-prone files.

### Evidence, not confidence

Completion requires machine-readable evidence: builds, test results, playtest traces, screenshots, metrics, requirement coverage, and artifact provenance. An agent saying that work is complete is not evidence.

### Failures become reusable tests

Reproducible command traces, seeds, snapshots, and minimized scenarios become regression fixtures rather than disappearing into task logs.

## Documents

- [Architecture](architecture.md) defines system boundaries, execution flow, artifact handling, and isolation.
- [Human-agent specification authoring playbook](specification-authoring.md) gives the game designer and agents a practical workflow for turning Chip City's prose direction into reviewed, machine-readable inputs without inventing product intent.
- [Direction packet specification](direction-packet.md) defines the human-approved input contract for an autonomy epoch.
- [Human and agent player protocol](player-protocol.md) defines commands, observations, events, replays, and interface adapters.
- [Orchestration and task management](orchestration.md) defines agent roles, task contracts, lifecycles, dependencies, retries, and approval boundaries.
- [Autonomous operations](operations.md) defines direction packets, autonomy epochs, agent-reviewed pull requests, stop conditions, and human checkpoints.
- [Control-plane enforcement](control-plane.md) defines identities, state machines, policy gates, reconciliation, liveness, and deadlock recovery.
- [Verification and playtesting](verification.md) defines validation layers, testing cycles, evidence gates, and regression handling.

## Terminology

| Term | Meaning |
| --- | --- |
| Specification | Human-approved, versioned description of required behavior or output |
| Planner | Agent that converts specifications and repository state into a task graph |
| Worker | Specialized agent that produces a candidate artifact |
| Integrator | Sole owner of merging compatible candidate artifacts into a build candidate |
| Evaluator | Independent agent or deterministic process that judges acceptance evidence |
| Player protocol | Stable commands and observations shared by human and agent adapters |
| Semantic player | Agent that plays through structured commands and observations |
| Black-box player | Agent that plays through rendered output and ordinary controls |
| Oracle | Test-only access to authoritative state that is not available to players |
| Evidence bundle | Immutable record of inputs, outputs, versions, tests, traces, and evaluations |
| Direction packet | Human-approved goals, constraints, budgets, and acceptance policy for a period of autonomous work |
| Autonomy epoch | Bounded production period during which the factory may plan, implement, review, and merge within a direction packet |
| Human checkpoint | Playable build and evidence package presented for human testing and realignment |

## Initial adoption path

The architecture should be introduced incrementally:

1. Define machine-readable specifications and acceptance scenarios.
2. Move all game mutations behind a player-command boundary.
3. Add deterministic headless execution, snapshots, and command replay.
4. Run semantic playtests in continuous integration.
5. Add isolated code and asset workers with human-controlled integration.
6. Add black-box visual playtesting and independent evaluation.
7. Permit bounded autonomous task cycles once their success criteria are measurable.

The early stages are valuable even if the full autonomous factory is never built. They improve accessibility, testability, replay debugging, content validation, and human development workflows.
