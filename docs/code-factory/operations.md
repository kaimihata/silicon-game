# Autonomous operations

**Status:** Proposed operating model for long-running production between human checkpoints.

## Intent

The factory should not depend on a person keeping a chat session open or approving every pull request. A human provides strong direction, approves a bounded period of authority, and returns to a playable build with evidence, open risks, and a small set of decisions.

The unit of operation is an **autonomy epoch**:

```text
human direction workshop
        |
        v
approved direction packet
        |
        v
plan and risk review
        |
        v
autonomous implementation, review, merge, and playtest
        |
        +----> continue while evidence passes and authority remains
        |
        +----> quarantine or defer isolated blocked work
        |
        v
playable human checkpoint
        |
        v
human feedback and next direction packet
```

An epoch ends at a planned product checkpoint, an authority boundary, or a hard stop condition. It is not an unlimited instruction to improve the game.

## Direction packet

The human and planning agent produce a versioned direction packet before an epoch starts. It contains enough detail for the system to make local implementation decisions without repeatedly asking for product direction.

The normative packet contract, validation rules, and implementation-neutral format are defined in [Direction packet specification](direction-packet.md).

Required sections are:

- outcome and intended player experience;
- approved mechanics and interactions;
- explicit non-goals;
- content and visual direction;
- architectural constraints;
- public contracts that may or may not change;
- milestone sequence and checkpoint definition;
- executable acceptance scenarios;
- technical and performance budgets;
- asset provenance and licensing policy;
- permitted dependencies and external services;
- risk classes the factory may approve autonomously;
- compute, financial, and wall-time budgets;
- unresolved questions and their blocking scope;
- hard stop conditions;
- named human checkpoint owner.

The packet references exact specification and repository revisions. Material changes create a new packet revision and invalidate affected plans.

The planner must expose ambiguity before the epoch begins. During the epoch, ambiguity is handled according to its scope:

- choose among implementations that are equivalent under the packet;
- defer an isolated feature and continue unrelated work;
- use an explicitly approved provisional choice behind a reversible boundary;
- stop only when the ambiguity affects the critical path or would change product intent.

## Epoch lifecycle

### Prepare

1. Validate specifications and resolve references.
2. Produce a milestone-level dependency graph.
3. Identify serialized ownership and high-risk changes.
4. Estimate execution and external-service budgets.
5. Generate acceptance and playtest plans.
6. Obtain human approval for the direction packet and authority policy.

### Execute

1. Expand the next milestone into bounded tasks.
2. Dispatch ready tasks to isolated workers.
3. Collect candidates and task-local evidence.
4. Run independent review and integration.
5. Merge accepted work through the repository merge queue.
6. Run continuous semantic playtests and scheduled rendered playtests.
7. Create repair tasks from reproducible failures.
8. Replan from current repository state without changing the direction packet.

### Stabilize

Before a human checkpoint:

1. Stop beginning nonessential high-risk work.
2. Integrate or explicitly defer open candidates.
3. Run the checkpoint verification matrix.
4. Produce a tagged playable build.
5. Generate the checkpoint evidence and briefing.

### Realign

The human plays the build and responds to concrete product questions. Feedback is converted into specification changes, priority changes, or a new direction packet. The next epoch starts from the accepted repository and content revisions, not from agent conversational memory.

## Durable control plane

A long-running factory needs a small durable scheduling service. It may run on a VM initially, but its process and filesystem are not authoritative.

Durable state belongs in:

- a transactional task and lease database;
- the Git repository;
- immutable artifact and evidence storage;
- GitHub pull requests, checks, and audit events;
- versioned environment definitions;
- a secret manager.

The coordinator process owns:

- direction-packet and epoch state;
- task DAG revisions;
- leases, retries, heartbeats, and budgets;
- GitHub webhook consumption;
- worker dispatch;
- integration and merge-queue scheduling;
- checkpoint scheduling;
- stop-condition enforcement;
- notifications and recovery after restart.

Workers run in ephemeral, isolated environments. Code-oriented tasks may use GitHub Copilot cloud-agent tasks. Engine builds, 3D asset generation, and rendered playtests may use dedicated CPU, GPU, or licensed-engine runners.

The initial VM should coordinate rather than become a shared development workstation. No worker should depend on mutable files left by a previous worker.

## GitHub operating model

GitHub is the visible collaboration and integration boundary:

- custom-agent definitions and repository instructions are versioned in the repository;
- the coordinator dispatches code tasks through the Copilot Agent Tasks API;
- each integration unit produces a branch and pull request;
- GitHub Actions and specialized runners publish required checks;
- GitHub webhooks advance durable task state;
- a protected merge queue serializes accepted changes;
- incomplete features remain behind specification-controlled feature flags;
- checkpoint builds are tagged from a continuously green main branch.

Avoid a long-lived staging branch that accumulates unverified changes. Main should remain reproducible and playable at its declared feature level.

## Agent review and approval

Agents may approve and merge pull requests within the active authority policy, but no candidate may approve itself.

The minimum separation is:

```text
author worker
    |
    v
deterministic CI
    |
    v
independent reviewer agent
    |
    v
integration/evidence agent
    |
    v
protected merge queue
```

The reviewer receives the requirement references, diff, relevant context, and CI evidence. It looks for correctness, specification drift, missing tests, unsafe dependencies, asset provenance, and integration risk. It does not repair the branch it reviews.

The integration agent verifies:

- the author and reviewer are distinct executions;
- required checks are current for the pull request head;
- the candidate targets the active specification and plan revisions;
- every requirement has declared evidence;
- no unresolved blocking review remains;
- the change class permits agent approval;
- branch protection and merge-queue requirements pass.

After merge, main-branch verification may automatically revert or disable a bounded change through a predetermined recovery mechanism. Agents must not rewrite shared history.

## Change authority

The direction packet defines change classes. A starting policy is:

| Class | Examples | Approval |
| --- | --- | --- |
| A: Derived and mechanical | Generated registries, asset imports from approved sources, formatting, deterministic migrations | Automated checks and integration agent |
| B: Bounded implementation | Code and assets implementing an approved requirement without changing public semantics | Independent reviewer agent and required evidence |
| C: Structural | Public interfaces, persistence, engine architecture, new dependencies, build infrastructure | Human-approved design or explicit epoch authorization, then agent review |
| D: Product direction | Mechanics, economy intent, interaction model, visual direction, scope, licensing exceptions | Human approval |
| E: Factory authority | Approval rules, permissions, secrets, budget limits, stop conditions | Human approval |

An agent cannot downgrade a change class. When uncertain, it selects the more restrictive class.

## Continuous planning without specification drift

The planner may:

- reorder tasks;
- split or combine implementation work;
- choose among equivalent technical approaches;
- create repairs and regression tests;
- defer noncritical work;
- consume contingency budget;
- improve implementation quality required by an accepted constraint.

The planner may not:

- invent new product goals;
- weaken acceptance criteria;
- redefine failed behavior as intended;
- expand scope because workers finished early;
- consume additional budget without authority;
- change its own approval policy;
- hide deferred or failed requirements from the checkpoint.

## Stop conditions

The coordinator pauses affected work immediately for:

- security, privacy, provenance, or licensing violations;
- loss of audit or evidence integrity;
- repeated failure of main-branch verification;
- exhausted compute, financial, or time budget;
- non-convergence beyond the retry policy;
- a required product decision outside the direction packet;
- incompatible specification revisions;
- inability to reproduce builds or tests;
- unexpected modification of factory permissions or approval policy.

Where safe, unrelated task branches continue. A global stop is reserved for compromised authority, repository integrity, or critical-path uncertainty.

## Checkpoint package

Human attention should focus on the product rather than agent activity. Each checkpoint contains:

- installable or streamable playable build;
- short guided route through newly implemented experiences;
- save states for important scenarios;
- concise release notes organized by player-visible outcome;
- requirement coverage and deferred-scope report;
- semantic-playtest strategy and balance results;
- black-box playtest recordings and usability findings;
- performance and stability trends;
- representative asset turntables or scene captures;
- known risks and provisional choices;
- a small prioritized set of realignment questions;
- proposed direction for the next epoch.

Task logs, individual prompts, and raw agent transcripts remain available for audit but are not the primary human interface.

## Notifications

Routine progress should be visible on demand rather than interrupting the human. Send active notifications only for:

- a hard stop;
- a decision blocking the critical path;
- approaching budget exhaustion;
- compromised build or repository integrity;
- a checkpoint ready for testing.

A periodic digest may report verified progress, current milestone, budget use, blocked branches, and forecast checkpoint date.

## Availability and recovery

The scheduler must tolerate restarts and worker loss:

- tasks use leases and idempotency keys;
- webhooks are persisted before processing;
- operations can be replayed safely;
- worker heartbeats expire abandoned leases;
- artifact publication is atomic;
- database backups and restore tests are scheduled;
- the coordinator reconciles its database with GitHub after recovery;
- duplicate dispatch cannot produce duplicate merges.

The factory is healthy when a coordinator can be replaced, recover durable state, reconcile active work, and continue without relying on a previous chat or process memory.
