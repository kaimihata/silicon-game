# Orchestration and task management

**Status:** Proposed multi-agent operating model.

## Orchestrator responsibilities

The orchestrator coordinates work but does not implement arbitrary tasks itself. It owns:

- specification and repository revision selection;
- planning and task-graph revisions;
- task readiness and dependency state;
- worker selection and permission assignment;
- execution budgets and retry policy;
- candidate and evidence collection;
- integration scheduling;
- escalation to humans;
- durable audit history.

The orchestrator must be replaceable without losing project state. Durable state belongs in task records, artifact manifests, and evidence bundles rather than model conversation history.

## Agent roles

| Role | Produces | Must not do |
| --- | --- | --- |
| Specification compiler | Validation and ambiguity reports | Invent missing product decisions |
| Planner | Versioned dependency graph | Modify implementation |
| Domain-code worker | Simulation code and unit tests | Change approved mechanics |
| Engine worker | Engine integration and editor tooling | Put authoritative rules in presentation code |
| Asset director | Structured briefs and consistency evaluation | Approve its own generated assets alone |
| Asset worker | Staged source assets and validation renders | Import directly into shared production scenes |
| Scene/UI worker | Assigned scenes, prefabs, and interface components | Concurrently edit globally owned serialized files |
| Test worker | Tests, fixtures, and scenario automation | Change production behavior to make tests pass |
| Semantic playtester | Command traces and strategy reports | Use oracle state |
| Black-box playtester | Input traces, captures, and usability reports | Call semantic commands |
| Integrator | Build candidate and integration manifest | Redefine acceptance criteria |
| Evaluator | Verdict and evidence gaps | Repair the candidate it is judging |

A deployment may combine roles for cost, but role boundaries and permissions should remain explicit. High-risk evaluation must stay independent from production.

## Task contract

Tasks are durable records with machine-readable fields:

```json
{
  "taskId": "implement-placement-validation",
  "planRevision": 7,
  "title": "Implement placement validation",
  "type": "code",
  "requirements": ["interaction.placement.4", "simulation.grid.2"],
  "inputs": {
    "specRevision": "design-42",
    "repositoryRevision": "abc123",
    "artifacts": ["schema.entity.v3"]
  },
  "allowedWrites": [
    "src/simulation/placement/**",
    "tests/simulation/placement/**"
  ],
  "dependencies": ["define-entity-footprints"],
  "acceptance": [
    "placement-contract-tests",
    "headless-scenario-valid-layout",
    "headless-scenario-blocked-output"
  ],
  "requiredOutputs": [
    "candidate patch",
    "validation report",
    "assumption report"
  ],
  "risk": "medium",
  "budget": {
    "attempts": 2,
    "wallTimeMinutes": 30
  }
}
```

Tasks must be small enough to validate independently but large enough to produce a coherent result. A task without an observable acceptance condition is not ready.

## Task lifecycle

```text
draft
  |
  v
ready --> leased --> executing --> candidate --> verifying --> accepted
  |          |           |             |            |
  |          |           |             |            +--> revision requested
  |          |           |             +--------------> integration conflict
  |          |           +----------------------------> failed or blocked
  |          +----------------------------------------> lease expired
  +---------------------------------------------------> needs decision
```

State transitions are recorded with actor, reason, inputs, and timestamp. A lease prevents duplicate workers from publishing competing results for the same task while allowing recovery from abandoned executions.

An accepted task means its candidate and evidence passed its declared gate. It does not imply that a later integrated build will pass higher-level checks.

## Dependency management

The planner creates a directed acyclic graph. A task becomes ready only when:

- all required specifications are approved;
- dependencies are accepted at compatible revisions;
- its write ownership does not conflict with active work;
- its environment and required tools are available;
- no unresolved human decision blocks it.

Changes to a dependency mark affected downstream candidates stale. The planner determines which tasks require rerun rather than assuming every dependent task remains valid.

## Context assembly

Workers receive task-specific context:

- relevant specification fragments;
- dependency artifact manifests;
- owned source files and nearby interfaces;
- repository conventions;
- validation commands;
- known failure records;
- explicit exclusions.

They should not receive the entire project history by default. Context must be reproducible and recorded so a later worker can understand what the original worker was allowed to know.

## Concurrency and ownership

Parallel work is safe when ownership is disjoint. The planner maintains ownership classes:

- ordinary source files may use normal merge conflict detection;
- schemas and public interfaces require coordinated changes;
- project settings, registries, lockfiles, scenes, and binary assets have serialized ownership;
- generated files are changed only through their generator;
- integration outputs are owned exclusively by the integrator.

If two tasks require the same serialized artifact, the planner orders them or extracts independent source inputs that a deterministic generator can combine.

## Failure and retry policy

Failures are classified before retry:

| Class | Response |
| --- | --- |
| Transient infrastructure failure | Retry with the same task and idempotency key |
| Tool or environment failure | Repair environment or route to a compatible worker |
| Implementation failure | Return structured evidence for one bounded revision attempt |
| Integration conflict | Replan ownership or dependency order |
| Specification ambiguity | Stop and request a human decision |
| Repeated non-convergence | Escalate with attempts, evidence, and alternatives |
| Safety, license, or provenance failure | Quarantine artifact; do not retry around the policy |

Retries preserve prior attempts. The system must not repeatedly regenerate candidates without learning from concrete failures or changing its approach.

## Human decision boundaries

Human approval is required for:

- starting an autonomy epoch and approving its direction packet;
- new or changed game behavior outside the active direction packet;
- unresolved design ambiguity;
- changes to public schemas or player-protocol semantics;
- external asset licensing uncertainty;
- major visual-direction choices;
- new dependencies or external services;
- security or privacy policy changes;
- scope, schedule, or budget expansion;
- modifying the factory's own approval or permission policy;
- final release promotion.

Behavior explicitly authorized by the direction packet, routine implementation, deterministic repair, regeneration of derived artifacts, agent-reviewed integration, and rerunning established checks may proceed autonomously within budget. A blocked task should not stop unrelated branches of the task graph; the orchestrator continues safe work and collects blocked decisions for the next checkpoint.

Decision requests should be narrow and evidence-based. They include the blocking question, relevant specification, attempted interpretations, consequences, and a recommended choice without bundling unrelated decisions.

## Planning for convergence

The factory should optimize for verified progress rather than agent activity. Useful orchestration metrics include:

- accepted tasks per attempt;
- stale work caused by dependency changes;
- integration-conflict rate;
- median time from failure to reproducible fixture;
- human decisions requested per accepted feature;
- requirements with passing evidence;
- regressions caught before integration;
- compute and external-service cost per accepted task.

High task throughput with low acceptance or frequent rework indicates poor specification or decomposition, not successful autonomy.
