# Verification and playtesting

**Status:** Proposed evidence and feedback system.

## Purpose

The code factory needs fast feedback for implementation and independent evidence for acceptance. These are related but not identical:

- workers run local checks to improve candidates;
- the integration pipeline verifies compatibility;
- playtesters exercise player-visible behavior;
- the evaluator judges evidence against approved requirements;
- humans approve product intent and release quality.

## Verification layers

Checks run from cheapest and most deterministic to most expensive:

1. **Specification checks:** schema validity, references, units, constraints, and unresolved decisions.
2. **Static checks:** compilation, type checks, content validation, asset naming, and dependency policies.
3. **Domain tests:** formulas, invariants, commands, state transitions, serialization, and migrations.
4. **Property tests:** broad generated inputs for conservation, reachability, bounds, and determinism.
5. **Integration tests:** engine adapters, imports, scenes, prefabs, UI bindings, saves, and builds.
6. **Semantic playtests:** goal-directed play through public commands and observations.
7. **Black-box playtests:** rendered play using ordinary controls and player-visible information.
8. **Performance tests:** frame time, simulation throughput, memory, load time, and asset budgets.
9. **Independent evaluation:** requirement coverage, evidence quality, regressions, and unresolved risk.
10. **Human review:** feel, aesthetics, creative coherence, and release judgment.

A failure at an early layer normally prevents more expensive downstream runs unless those runs are needed to diagnose it.

## Candidate cycle

```text
worker candidate
      |
      v
task-local checks
      |
      v
isolated integration
      |
      v
deterministic regression suite
      |
      +----> semantic scenarios
      |
      +----> rendered integration checks
                    |
                    v
             black-box scenarios
                    |
                    v
            independent evaluation
                    |
       accept, revise, quarantine, or escalate
```

The evaluator reports failures to the orchestrator. It does not modify the candidate, because doing so would combine production and judgment and make acceptance evidence unreliable.

## Scenario format

Playtest scenarios declare goals and constraints rather than prescribing one command sequence:

```json
{
  "scenarioId": "onboarding-basic-production",
  "scenarioVersion": 3,
  "initialState": "new-company",
  "playerKnowledge": ["basic-controls", "starter-catalog"],
  "goals": [
    {"metric": "acceptedDeliveries", "operator": ">=", "value": 1000},
    {"metric": "cash", "operator": ">", "value": 0}
  ],
  "invariants": [
    "rejected items never satisfy delivery",
    "all purchases are charged exactly once"
  ],
  "budgets": {
    "simulationMinutes": 120,
    "playerCommands": 500
  },
  "requiredExplanations": [
    "identify current bottleneck"
  ],
  "oracleChecks": [
    "accounting-conservation",
    "no-hidden-inventory"
  ]
}
```

Several strategies may satisfy one scenario. Reference traces are regression fixtures, not the only valid solutions.

## Semantic playtesting

Semantic players use only public commands and observations. They are suitable for:

- progression reachability;
- tutorial and objective completion;
- economy and balance exploration;
- search for degenerate or dominant strategies;
- large seed matrices;
- long-running simulations;
- reproducible bug isolation;
- validation of error recovery.

Run several player policies rather than one general agent:

- novice policy with limited knowledge and shallow planning;
- goal-directed baseline;
- cost optimizer;
- throughput optimizer;
- adversarial policy seeking exploits;
- random but valid action explorer;
- regression replay policy.

An agent failing a scenario does not by itself prove the game is impossible. Compare agents, deterministic reachability checks, known traces, and human results.

## Black-box playtesting

Black-box players receive rendered frames, accessibility semantics, and normal input controls. They test:

- discoverability of actions;
- visual state readability;
- selection and camera behavior;
- disabled-action explanations;
- error recovery;
- tutorial clarity;
- layout at supported resolutions;
- whether animation and feedback match authoritative events.

The run records screenshots or video, input events, accessibility snapshots, command results produced indirectly by the UI, and commentary linked to simulation ticks.

Black-box tests should begin with bounded scenarios. Open-ended full-game play is expensive, difficult to evaluate, and poor at producing minimal failures.

## Test oracle

The oracle reads authoritative state solely for evaluation. It may verify:

- conservation of items and currency;
- hidden queue or inventory correctness;
- exact causal links;
- seeded outcomes;
- absence of impossible states;
- state hashes at replay checkpoints.

The playing agent cannot query the oracle. Separating player and oracle access prevents a test from passing through capabilities unavailable to humans.

## Evidence bundle

Each evaluated candidate emits an immutable bundle:

```json
{
  "candidateId": "candidate-108",
  "requirements": {
    "interaction.placement.4": ["test:placement-contract", "trace:visual-placement-12"],
    "simulation.grid.2": ["test:grid-properties"]
  },
  "revisions": {
    "specification": "design-42",
    "repository": "abc123",
    "environment": "unity-linux-17"
  },
  "results": {
    "build": "passed",
    "deterministicTests": "passed",
    "semanticPlaytests": "passed",
    "blackBoxPlaytests": "warning"
  },
  "artifacts": [
    "logs/build.txt",
    "traces/semantic-001.json",
    "captures/black-box-004.mp4",
    "metrics/performance.json"
  ],
  "openRisks": [
    "Black-box player missed the rotate control on its first attempt."
  ]
}
```

Evidence links requirements to concrete checks. A green aggregate status without requirement-level traceability is insufficient for autonomous acceptance.

## Acceptance gates

Suggested gates are:

| Gate | Required evidence |
| --- | --- |
| Task candidate | Declared outputs and task-local checks |
| Integrated candidate | Compatible revisions, clean integration, build success |
| Behavior acceptance | Requirement tests, semantic scenarios, invariant checks |
| Interaction acceptance | Human adapter contract tests and bounded black-box scenarios |
| Asset acceptance | Provenance, technical validation, budget checks, visual review |
| Release candidate | Full regression matrix, performance budgets, human approval |

Warnings require explicit disposition: accept known risk, issue a follow-up task, or block promotion.

## Regression handling

Every actionable failure should preserve:

- candidate and environment revisions;
- initial scenario or snapshot;
- seed;
- accepted and rejected player commands;
- state hashes;
- logs and captures;
- first known divergence;
- minimized reproduction when feasible.

The repair task references this record. After repair, the reproduction is added to the permanent suite at the cheapest layer capable of detecting it.

## Factory self-evaluation

The factory itself requires benchmark scenarios with known requirements and hidden checks. Track:

- first-attempt acceptance rate;
- regressions introduced per accepted task;
- semantic and visual scenario completion;
- evaluator false acceptance and false rejection;
- reproducibility rate;
- human intervention frequency;
- time and cost to accepted evidence;
- asset provenance and technical rejection rates.

Evaluation should compare the complete agent-plus-tools system, not just the underlying language model. Tool design, context selection, task decomposition, and feedback quality materially affect results.
