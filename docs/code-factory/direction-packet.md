# Direction packet specification

**Status:** Normative design contract for later implementation.

## Purpose

A direction packet is the complete human-approved authority for one autonomy epoch. It tells the planning agent what outcome to pursue, what interpretations are permitted, how success is measured, what resources it may consume, and when it must stop.

The packet is not:

- a task list;
- a conversational prompt;
- an implementation plan;
- unlimited permission to improve the product;
- a replacement for referenced game, interaction, content, or technical specifications.

The planner compiles a valid packet and its referenced specifications into a versioned task DAG. Workers never receive authority beyond the packet.

## Storage and format

Store packets as versioned YAML in the repository:

```text
code-factory/
  direction-packets/
    <epoch-id>.yaml
```

The future control-plane implementation should validate them with a versioned JSON Schema. This document defines the semantic contract independently of the eventual parser, scheduler, or model provider.

Every packet is immutable after approval. Corrections create a new revision with a new content digest. The control plane records both the stable packet identifier and exact approved digest.

## Top-level contract

```yaml
schema_version: 1

identity:
  packet_id: vertical-slice-01
  revision: 1
  title: First playable vertical slice
  status: draft

authority:
  owner: github-user-or-team
  approvers:
    - github-user
  approved_at: null
  supersedes: null

source:
  repository: owner/repository
  base_ref: main
  base_revision: full-git-sha
  specification_revision: full-content-digest
  policy_revision: full-content-digest

intent:
  outcome: >
    A concise statement describing the player-visible result that must exist
    at the checkpoint.
  player_experience:
    - id: experience-001
      statement: The player understands what to do without hidden knowledge.
      evidence: [black_box_playtest]
  principles:
    - Preserve readable cause and effect.

scope:
  included:
    - id: scope-001
      statement: Implement the approved placement interaction.
      specifications: [interaction.placement]
  excluded:
    - Final production art
  assumptions:
    - id: assumption-001
      statement: One local player is supported.
      disposition: fixed_for_epoch

requirements:
  - id: requirement-001
    statement: The player can place an entity on a valid empty footprint.
    source: interaction.placement.4
    priority: must
    acceptance:
      - check_id: placement-contract
        type: automated_test
      - check_id: place-through-ui
        type: black_box_scenario

constraints:
  architecture:
    - id: constraint-architecture-001
      statement: Authoritative simulation must not depend on rendering.
      enforcement: required_check
  compatibility: []
  performance:
    - metric: frame_rate_p95
      operator: greater_than_or_equal
      value: 60
      unit: frames_per_second
      environment: reference-client
  accessibility: []
  security: []
  privacy: []
  provenance: []
  dependencies:
    new_dependencies: prohibited
    allowed_services: []

milestones:
  - id: milestone-001
    title: Placement loop
    outcomes: [requirement-001]
    depends_on: []
    checkpoint_required: false

verification:
  required_suites:
    - build
    - domain
    - semantic_playtest
    - black_box_playtest
  scenarios:
    - scenario.valid-placement
  reference_environments:
    - reference-client
  evidence_retention_days: 90

authority_policy:
  autonomous_change_classes: [A, B]
  provisional_decisions: []
  protected_paths:
    - code-factory/policy/**
  human_approval_topics:
    - product_direction
    - public_protocol_semantics
    - licensing_exception

budgets:
  epoch:
    wall_time_days: 14
    external_cost_usd: 500
    agent_tasks: 100
  retries:
    per_task: 2
    per_failure_signature: 3
  concurrency:
    authors: 4
    reviewers: 2
    integrators: 1
    rendered_playtests: 1
  contingency_percent: 15

checkpoint:
  trigger:
    type: all_milestones_complete
  deliverables:
    - playable_build
    - guided_test_route
    - requirement_coverage
    - semantic_playtest_report
    - black_box_recordings
    - performance_report
    - deferred_scope
    - realignment_questions
  owner: github-user

notifications:
  digest_interval_hours: 24
  immediate:
    - hard_stop
    - critical_path_decision
    - main_branch_unhealthy
    - budget_warning
    - checkpoint_ready

stop_conditions:
  - id: stop-main-unhealthy
    condition: main_branch_unhealthy
    threshold:
      duration_minutes: 120
    scope: global
  - id: stop-budget
    condition: budget_consumed
    threshold:
      percent: 100
    scope: global
  - id: stop-missing-authority
    condition: decision_outside_packet
    scope: affected_branch

open_questions: []
```

## Field semantics

### `identity`

| Field | Requirement |
| --- | --- |
| `packet_id` | Stable, unique identifier that never refers to another epoch |
| `revision` | Positive integer increasing for each replacement |
| `title` | Human-readable checkpoint outcome |
| `status` | `draft`, `in_review`, `approved`, `active`, `stabilizing`, `completed`, `stopped`, or `superseded` |

Only the control plane changes operational status. The approved packet content remains immutable.

### `authority`

Identifies who may approve, supersede, stop, or realign the epoch. Approval must be a signed or auditable event over the packet digest. An agent may help draft the packet but cannot be its human approver.

### `source`

Pins every authority input:

- repository and exact base commit;
- aggregate specification digest;
- factory-policy digest.

Mutable branch names are descriptive only. Planning and execution use immutable revisions.

### `intent`

Defines the result, experience, and decision principles. Statements should describe observable product outcomes rather than implementation tasks.

Each player-experience statement declares expected evidence. Subjective outcomes may require black-box or human evidence rather than pretending to be deterministic.

### `scope`

Defines the permitted product boundary:

- `included` identifies work the planner may schedule;
- `excluded` prevents opportunistic expansion;
- `assumptions` records temporary fixed interpretations.

An assumption disposition is one of:

- `fixed_for_epoch`: workers treat it as authoritative until realignment;
- `provisional_reversible`: implementation must remain isolated and reversible;
- `validate_during_epoch`: the planner creates an evidence task but cannot change product behavior automatically.

### `requirements`

Every requirement has:

- globally unique stable identifier;
- testable statement;
- source-specification reference;
- `must`, `should`, or `could` priority;
- at least one acceptance check.

`must` requirements block their milestone. `should` requirements require explicit defer evidence. `could` requirements may only be scheduled after all critical-path work is healthy and sufficient contingency remains.

Acceptance-check types are:

- `schema`;
- `static_check`;
- `automated_test`;
- `property_test`;
- `integration_test`;
- `semantic_scenario`;
- `black_box_scenario`;
- `performance_measurement`;
- `asset_validation`;
- `human_review`.

The planner may add checks but cannot remove or weaken packet checks.

### `constraints`

Constraints define implementation boundaries and measurable budgets. Every normative architectural constraint must identify an enforcement mechanism:

- required automated check;
- protected interface;
- code ownership;
- reviewer policy;
- human review.

A prose-only constraint with no enforcement route makes the packet invalid unless explicitly marked advisory.

Performance constraints include metric, operator, threshold, unit, and reference environment. Results from an unspecified environment cannot satisfy them.

### `milestones`

Milestones group player-visible outcomes and form an acyclic dependency graph. They are not implementation epics.

Each milestone must:

- reference at least one requirement;
- have no circular dependencies;
- fit within the epoch budget;
- produce an integrated, verifiable repository state;
- declare whether it forces an intermediate human checkpoint.

The planner creates implementation tasks beneath milestones.

### `verification`

Names required suites, scenarios, environments, and retention. Referenced scenarios and environments must exist at the pinned specification revision.

The checkpoint cannot complete while required evidence is missing, stale, or tied to another candidate revision.

### `authority_policy`

Declares what the factory may approve autonomously. Change classes use the definitions in [Autonomous operations](operations.md).

Protected paths and human-approval topics override autonomous class permissions. The factory always chooses the stricter rule.

A provisional decision must declare:

- decision identifier;
- permitted choice;
- affected scope;
- expiration milestone;
- isolation or feature-flag mechanism;
- evidence requested for later human review.

### `budgets`

Budgets are hard scheduling inputs, not reporting targets.

- Normal work may consume `100 - contingency_percent`.
- Contingency is reserved for critical-path repair and stabilization.
- New feature work stops before consuming contingency.
- The coordinator stops affected dispatch when a hard limit is reached.

Currency amounts cover external model, generation, storage, and worker charges tracked by the factory. Cloud infrastructure that cannot be attributed per epoch must be reported separately.

### `checkpoint`

Defines when autonomous production stops and what the human receives. A packet without a bounded checkpoint trigger is invalid.

Allowed trigger forms include:

- all named milestones complete;
- specific milestone complete;
- fixed deadline;
- budget threshold;
- earliest of several bounded triggers.

### `notifications`

Routine progress belongs in the dashboard or digest. Immediate notification types are constrained to events requiring attention or signaling a testable checkpoint.

### `stop_conditions`

Every condition declares:

- stable identifier;
- machine-detectable condition or named control-plane incident;
- threshold where applicable;
- `task`, `affected_branch`, `worker_class`, or `global` scope;
- automatic disposition or reference to policy-defined disposition.

Global stops are reserved for authority, integrity, security, or critical-path failures.

### `open_questions`

Questions have:

- identifier;
- exact decision required;
- owner;
- blocking scope;
- deadline;
- available choices and consequences where known.

An approved packet cannot contain an unresolved question that blocks its first milestone. Noncritical questions may remain if their affected work is explicitly parked.

## Validation phases

### Structural validation

- YAML parses and conforms to the supported schema version.
- Required fields exist.
- Identifiers are unique and syntactically valid.
- Enum values and units are supported.
- References resolve.

### Semantic validation

- Requirement acceptance is measurable.
- Milestone dependencies are acyclic.
- All `must` requirements belong to a milestone.
- Constraint enforcement mechanisms exist.
- Budgets and retry limits are finite.
- A checkpoint trigger is bounded.
- Every waiting or stop condition has a disposition.
- Protected topics cannot be autonomously approved.
- No critical-path open question remains.

### Feasibility analysis

The planner produces, without implementation:

- milestone DAG;
- critical path;
- affected system map;
- serialized ownership map;
- worker-capability requirements;
- budget estimate and confidence interval;
- risk register;
- ambiguity report;
- proposed verification matrix.

Feasibility failure returns the packet to draft. The planner cannot silently narrow requirements to make the plan fit.

### Approval validation

Activation requires:

- valid packet and references;
- successful feasibility analysis;
- approved factory-policy revision;
- recorded human approval over the final digest;
- available minimum worker capabilities;
- healthy main branch;
- no active incompatible epoch.

## Amendments

During an epoch:

- implementation replanning does not amend the packet;
- editorial corrections that affect no semantics still create a new digest;
- scope, authority, budget, behavior, or acceptance changes require a new revision and human approval;
- affected tasks and evidence become stale;
- unaffected work may continue only after the control plane calculates revision compatibility.

The prior revision remains auditable.

## Completion contract

An epoch is `completed` only when:

- all `must` requirements have current passing evidence;
- all `should` requirements pass or have explicit defer dispositions;
- required milestones are integrated into a verified main revision;
- checkpoint artifacts are immutable and retrievable;
- budgets and policy incidents are reported;
- provisional decisions and open risks are disclosed;
- the human checkpoint owner accepts receipt of the package.

Human receipt does not imply final product approval. Feedback creates the next design revision or direction packet.

## Future implementation artifacts

Implementing this specification should produce:

```text
game-spec/
  schemas/
  scenarios/
  reference-environments/
code-factory/
  schemas/
    direction-packet-v1.schema.json
  direction-packets/
  policy/
```

The [specification-authoring playbook](specification-authoring.md#recommended-repository-shape) defines the ownership boundary: game-domain schemas, scenarios, and reference environments belong to `game-spec/`; factory policy, packet schemas, and direction packets belong to `code-factory/`.

The control plane should provide:

- `validate packet`;
- `analyze feasibility`;
- `submit for approval`;
- `activate epoch`;
- `supersede packet`;
- `show requirement coverage`;
- `prepare checkpoint`.

These operations should work through API and CLI surfaces and produce auditable state transitions.
