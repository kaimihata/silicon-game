# Control-plane enforcement

**Status:** Proposed enforcement and liveness design.

## Purpose

Multi-agent responsibilities cannot be enforced by prompts alone. The control plane enforces them through:

- separate service identities and least-privilege credentials;
- durable state machines;
- policy-as-code;
- protected repository rules;
- required status checks;
- immutable evidence;
- idempotent handoff events;
- periodic reconciliation;
- timeouts and bounded recovery.

The system cannot guarantee that no work item will ever block. It can guarantee that a blocked item is detected, classified, assigned, bounded, and prevented from silently stopping unrelated work.

## Enforcement layers

| Layer | Enforces |
| --- | --- |
| Direction packet | Product authority, scope, budgets, and permitted change classes |
| Task database | Dependencies, ownership, leases, attempts, and durable lifecycle |
| Worker credentials | Which operations each role can perform |
| Policy engine | Whether a candidate may advance to review, integration, or merge |
| GitHub ruleset | No direct push, required checks, current reviews, and merge queue |
| Artifact store | Immutable candidate and evidence provenance |
| Reconciler | Agreement between database, GitHub, workers, and artifact state |
| Watchdog | Timeouts, stalled queues, exhausted retries, and health invariants |

No single agent controls every layer.

## Service identities

Use distinct credentials even when several roles use the same underlying model:

| Identity | Read | Write | Prohibited |
| --- | --- | --- | --- |
| Coordinator | Repository metadata, tasks, checks | Dispatch tasks, update task state | Source changes, approval, merge bypass |
| Author worker | Assigned context and branch | Its candidate branch | Approval, merge, policy changes |
| Reviewer | Diff, specifications, evidence | Review record and `factory/review` check | Branch contents, merge |
| Evidence evaluator | Candidate and test artifacts | `factory/evidence` check and verdict | Branch contents, requirement changes |
| Integrator | Approved candidates and merge state | Update/rebase integration branch, enqueue merge | Bypass required checks |
| CI runner | Repository and test inputs | Named check results and artifacts | Source changes, merge |
| Release authority | Approved checkpoint evidence | Release promotion | Rewriting history |
| Human break-glass owner | Full audited recovery context | Explicit emergency operation | Unlogged bypass |

Separate GitHub Apps or equivalent service principals are preferable where GitHub permissions need to differ. Credential scope is an enforcement boundary; role names in prompts are not.

The author identity must be distinguishable from reviewer and evaluator identities. A new execution of the same broadly privileged identity is not sufficient separation.

## Policy as code

Factory policy is a versioned, machine-readable document that includes:

- role permissions;
- change classification rules;
- required checks by change class and path;
- reviewer and evaluator independence requirements;
- retry and timeout limits;
- merge-queue policy;
- budget limits;
- protected specifications and factory files;
- stop conditions;
- break-glass procedure.

Each autonomy epoch pins a policy revision. Policy changes are class E factory-authority changes and cannot approve themselves. The active policy hash is attached to tasks, check runs, evidence bundles, and merge decisions.

The policy compiler rejects:

- unknown checks or identities;
- a role that can author and approve the same candidate;
- required gates with no registered producer;
- circular gate dependencies;
- an unbounded retry or waiting state;
- protected paths without human authority;
- a bypass identity used in normal operation.

## Repository rules

Protect the main branch with a GitHub ruleset:

- prohibit direct pushes;
- require pull requests;
- require current status checks;
- dismiss or invalidate stale results after the head changes;
- require conversation resolution where appropriate;
- require the merge queue;
- prevent force pushes and deletion;
- restrict bypass to a separately controlled human break-glass identity.

The enforceable agent gates should be named status checks such as:

```text
factory/specification
factory/change-class
factory/author-separation
factory/review
factory/evidence
factory/integration
build/headless
test/domain
test/semantic-playtest
```

An agent may also submit a GitHub pull-request review for human-readable findings. The merge decision relies on required checks emitted by the policy-controlled reviewer and evaluator services, because whether automated review approvals count toward native required-review rules may depend on repository permissions and GitHub configuration.

The integrator sends an eligible pull request to the merge queue. It receives no routine ruleset bypass.

References:

- [REST API endpoints for pull request reviews](https://docs.github.com/rest/pulls/reviews)
- [Available rules for rulesets](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

## Durable handoff protocol

Handoffs are events persisted before side effects occur:

```json
{
  "eventId": "01H...",
  "eventType": "candidate.ready",
  "aggregateType": "task",
  "aggregateId": "implement-placement-validation",
  "expectedVersion": 12,
  "idempotencyKey": "task-123:attempt-2:candidate",
  "actor": "author-worker-17",
  "payload": {
    "candidateId": "candidate-108",
    "repositoryRevision": "abc123",
    "artifactManifest": "sha256:..."
  }
}
```

Processing uses an inbox/outbox pattern:

1. Commit the state transition and outgoing event in one database transaction.
2. Deliver the event to GitHub or a worker.
3. Record the external identifier.
4. Treat duplicate delivery with the same idempotency key as success.
5. Reconcile uncertain outcomes before retrying.

Webhooks are persisted before processing. Event order is checked against aggregate versions. Late events cannot move a task backward or approve a newer candidate accidentally.

## Pull-request state machine

```text
candidate
    |
    v
pr_open
    |
    v
ci_pending --> ci_failed --> repair_task
    |
    v
review_pending --> changes_requested --> repair_task
    |
    v
evidence_pending --> evidence_failed --> repair_task
    |
    v
merge_ready --> queued --> merged --> post_merge_verification
                              |               |
                              |               +--> passed
                              |               +--> recovery_task
                              |
                              +--> superseded
```

Each transition has:

- allowed source states;
- required role;
- required evidence;
- idempotency key;
- maximum age;
- timeout transition;
- retry budget;
- escalation or quarantine destination.

Pushing a new commit invalidates review, evidence, and merge-ready checks tied to the previous head SHA. Checks never apply to a branch name alone.

## Reconciliation loop

Webhooks provide speed; reconciliation provides correctness. A periodic reconciler compares desired durable state with observed external state:

- active task leases versus worker heartbeats;
- candidate records versus branches and commits;
- expected pull requests versus GitHub pull requests;
- check records versus current head SHA;
- queued merges versus merge-queue state;
- merged candidates versus main-branch ancestry;
- artifact manifests versus stored objects;
- running jobs versus execution-provider jobs.

Examples:

| Desired state | Observed state | Reconciliation |
| --- | --- | --- |
| Worker leased | No heartbeat before deadline | Expire lease and retry or reassign |
| PR expected | Branch exists, no PR | Create PR idempotently |
| Review passed | Head SHA changed | Invalidate review and enqueue new review |
| Merge queued | PR no longer eligible | Remove queue intent and create repair record |
| Task executing | Provider job completed | Import result or classify missing result |
| PR merged | Task not advanced | Verify ancestry and advance task |
| Artifact recorded | Object missing | Quarantine candidate |

The coordinator can restart, replay its outbox, reconcile GitHub, and resume without depending on in-memory agent state.

## Liveness invariants

The watchdog continuously checks:

1. Every nonterminal task is exactly one of ready, leased with a live deadline, waiting on named dependencies, or blocked with an owner and disposition.
2. Every waiting state has a timeout.
3. Every external operation has an idempotency key and reconciliation rule.
4. Every required status check has an enabled producer.
5. Every active lease eventually completes or expires.
6. Every merge-ready pull request is queued or has a recorded reason it cannot be queued.
7. Every blocked task identifies which downstream tasks it blocks.
8. At least one ready task is scheduled whenever eligible capacity exists.
9. Main remains at a known verified revision.
10. Factory policy and direction revisions match the active epoch.

Invariant failures create control-plane incidents rather than ordinary implementation retries.

## Preventing deadlocks

### Validate dependency graphs

The task DAG and approval-gate graph are compiled before execution. Cycles are rejected with the exact dependency path. Dynamic dependencies may only point to an earlier milestone or create a new plan revision that passes cycle validation.

### Avoid distributed locks

Use short database leases for task ownership. Do not hold a lock while waiting for an agent, CI, GitHub, asset generation, or human input.

When multiple serialized resources are unavoidable:

- acquire them in a globally defined order;
- use a short lease;
- publish no partial integration output;
- release all leases on failure;
- retry with randomized backoff;
- escalate repeated contention to replanning.

### Bound work in progress

Unlimited parallel authoring can overwhelm review and integration. Set per-stage limits and reserve capacity:

- authoring capacity;
- review capacity;
- integration capacity;
- repair capacity;
- critical-path capacity.

The scheduler stops dispatching new author tasks when review or merge queues exceed their thresholds. Repair and integration work take priority so the pipeline drains.

### Isolate blockers

A blocked task moves to a parked state with:

- blocker class;
- blocking requirement or dependency;
- owner;
- affected downstream set;
- next automatic action;
- deadline;
- human checkpoint visibility.

Its lease and write ownership are released. Independent DAG branches remain schedulable.

### Use fallback paths

Each worker class declares ordered recovery:

1. retry transient execution with the same inputs;
2. route to another compatible worker;
3. reduce to a diagnostic or minimization task;
4. split or replan the task;
5. defer noncritical scope;
6. request a human decision only when authority or critical-path progress requires it.

Repeatedly sending an unchanged task to the same agent is not a recovery strategy.

## Stale work and integration pressure

The scheduler calculates staleness from specification, policy, dependency-artifact, and base-repository revisions.

Before expensive work begins, it estimates whether upstream changes are likely to invalidate the candidate. Before review, a candidate must update to a mergeable base and rerun affected checks. The merge queue validates the combined result.

Prefer:

- small vertical changes;
- additive schemas and scenes;
- generated shared registries;
- feature flags for incomplete features;
- compatibility windows for public interfaces;
- frequent integration.

Avoid large batches of parallel branches that all change foundational interfaces.

## Blockage taxonomy

| Blocker | Automatic handling |
| --- | --- |
| Lost worker | Expire lease and reassign |
| Failed CI | Create repair task from logs |
| Review disagreement | Ask evaluator against specification; replan if unresolved |
| Merge conflict | Regenerate or create integration repair task |
| Stale evidence | Rerun checks for current head |
| Provider outage | Route provider or pause affected worker class |
| Missing specification | Park affected branch; continue others |
| Budget exhausted | Stop new dispatch in affected budget pool |
| Repeated non-convergence | Minimize failure, defer, or escalate |
| Policy contradiction | Global control-plane stop |
| Main regression | Pause merges, run predetermined recovery |

## Main-branch recovery

Post-merge verification runs against the actual main revision. If it fails:

1. pause new merge-queue entries;
2. identify the first failing merge through queue and check metadata;
3. create a revert PR for the bounded candidate or disable its approved feature flag;
4. pass the revert through emergency deterministic checks;
5. restore a known verified main revision without rewriting history;
6. create a repair task with the failing evidence;
7. resume unrelated work only after main is healthy.

Recovery authority is predetermined in the direction packet and policy. Agents cannot improvise destructive Git operations.

## Health dashboard

The human-facing health view should report:

- active epoch and pinned revisions;
- ready, running, parked, and failed task counts;
- critical path and estimated checkpoint;
- oldest item in each state;
- review and merge-queue depth;
- lease expirations and retries;
- main-branch verification state;
- blocked downstream task count by decision;
- budget burn and remaining contingency;
- control-plane incidents;
- last successful reconciliation.

The primary liveness metric is not the number of running agents. It is verified work reaching main while queues remain bounded and main stays healthy.

## Break-glass recovery

Break-glass access is human-only, separately credentialed, time-limited, and audited. Its use:

- pauses the active epoch;
- records the reason and affected revisions;
- invalidates outstanding merge authority;
- requires reconciliation before autonomous work resumes;
- produces a checkpoint incident report.

Normal operations must never depend on break-glass bypass to keep the factory moving.
