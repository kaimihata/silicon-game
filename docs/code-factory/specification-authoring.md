# Human-agent specification authoring playbook

**Status:** Proposed collaboration guide. Chip City's machine-readable game specifications do not yet exist as a complete, approved set.

## Purpose

This guide explains how a game designer and agents can turn Chip City's design direction into versioned, machine-readable inputs for implementation, simulation, playtesting, and future autonomous production.

The repository remains authoritative. Conversations, agent memory, generated summaries, and workshop notes are temporary working context until reviewed changes are committed.

This guide complements:

- [Code factory design](README.md) for the overall production model;
- [Architecture](architecture.md) for authority and artifact boundaries;
- [Human and agent player protocol](player-protocol.md) for commands and observations;
- [Verification and playtesting](verification.md) for scenarios and evidence;
- [Direction packet specification](direction-packet.md) for bounded implementation authority;
- [Orchestration](orchestration.md), [operations](operations.md), and [control-plane enforcement](control-plane.md) for later execution.

Chip City product intent currently lives in:

- [Game design](../game-design.md);
- [Chip parts](../chip-parts.md);
- [Component catalog](../component-catalog.md);
- [Factory machines](../factory-machines.md);
- [Machine and capability progression](../machine-progression.md);
- [Product and manufacturing metrics](../manufacturing-metrics.md);
- [Candidate first user interaction](../first-user-interaction.md).

Those documents establish direction and open questions. They are not already-complete schemas.

## Authority: what humans decide and what agents do

Agents accelerate specification work; they do not become the game designer.

| Human or game designer decides | Agents may safely do |
| --- | --- |
| Product fantasy, pillars, scope, and intended player experience | Find relevant source passages and prepare a focused decision question |
| Which mechanics exist and why they are fun | Offer explicit options, tradeoffs, and affected artifacts |
| Player-visible abstractions and terminology | Normalize approved terms and flag collisions or synonyms |
| Balance intent, acceptable strategies, and deliberate difficulty | Calculate consequences, explore parameter ranges, and identify dominant or degenerate cases |
| Progression shape, unlock meaning, and campaign teaching order | Draft records from approved decisions and validate prerequisites or reachability |
| Interaction semantics and information available to players | Draft command, observation, event, and error contracts |
| What counts as success, failure, and acceptable evidence | Draft scenarios and checks without weakening approved acceptance |
| Provisional assumptions that may guide an experiment | Record scope, expiration, reversibility, and required follow-up evidence |
| Approval of normative changes and direction packets | Produce diffs, validation reports, generated views, and review summaries |

An agent must stop the affected work and identify a decision gap when it encounters:

- missing product intent;
- contradictory higher-authority sources;
- more than one materially different mechanic consistent with the prose;
- an undefined default that changes outcomes;
- acceptance that cannot be measured as written;
- a change that would make an existing scenario easier to pass;
- a protocol capability not available to a human player.

It may continue unrelated work. It must never silently choose a mechanic, redefine a failure as success, or convert an open question into a hidden default.

## The authoring loop

Use a repeated workshop loop. Keep each decision small enough that its consequences can be understood before the next one.

### 1. Select one bounded topic

Choose one item such as:

- whether a recipe consumes one substrate per attempted package;
- whether an inspection reject can be reworked at the current progression tier;
- which observation reports a blocked machine;
- what evidence qualifies internal `MD-110` memory.

Do not ask for approval of an entire component family, economy, protocol, and scenario set at once.

### 2. Assemble a source card

The agent records:

- the exact question;
- relevant document and section links;
- current approved facts;
- contradictions or unknowns;
- affected specification IDs and scenarios;
- whether the decision blocks other work.

Commit an unresolved source card beside its decision record so another agent can reproduce the question. Once resolved, retain its alternatives and contradiction notes in the decision record rather than relying on a conversation transcript.

### 3. Ask one product decision

The agent asks one question at a time and gives a small set of explicit choices. Each choice includes:

- player-facing consequence;
- factory or economy consequence;
- implementation and testing consequence;
- compatibility impact;
- recommendation and rationale, when useful.

Free-form discussion is appropriate for creative direction, but it still ends in a discrete recorded decision or an explicitly unresolved question.

### 4. Record the decision before expanding it

Create or update a decision record with:

```yaml
decision_id: decision.recipe.substrate-consumption.001
status: proposed
question: When is a package substrate consumed?
choice: consumed_on_assembly_start
rationale: Rejected units must retain all invested component cost.
alternatives_considered:
  - choice: consumed_on_successful_assembly
    rejected_because: It would erase invested cost from assembly rejects.
sources:
  - docs/game-design.md#production-model
  - docs/first-user-interaction.md#starter-final-chip-design
owner: null
approved_at: null
approval_event: null
affects:
  - recipe.final-chip.basic-display
  - invariant.accounting.conservation
supersedes: null
```

Dates, owners, and identifiers are illustrative. Use the repository's approved identity and date conventions once established.

Agents may create only `draft` or `proposed` decisions. Only a human game-design authority, or approval automation acting on an auditable human event, may set `owner`, `approved_at`, `approval_event`, and `status: approved`. Validation rejects approved-looking decisions without a valid human approval event.

An unresolved question uses its own stable record with the exact question, owner, blocking scope, deadline, affected IDs, available choices, and consequences. Direction packets reference that ID instead of restating the question.

### 5. Draft the smallest coherent specification change

The agent updates source data, fixtures, scenarios, and references together. It does not edit generated views by hand or copy the same rule into several authoritative files.

### 6. Validate and challenge

The agent runs:

1. schema validation;
2. reference, enum, and unit validation;
3. semantic invariants and reachability checks;
4. deterministic fixtures or scenario checks;
5. generated-view comparison;
6. contradiction and ambiguity reporting.

Challenge questions should include:

- Can two records claim authority for the same value?
- Does any omitted field acquire a behavior-changing default?
- Are all failure outputs and destinations specified?
- Can progression reach this content without privileged setup?
- Does the protocol expose enough public information to explain the outcome?
- Could a test pass by using oracle data unavailable to a player?

### 7. Review the semantic diff

The human reviews player-visible changes, not only YAML lines. Generated reports should summarize:

- added, removed, and changed mechanics;
- numerical changes with units and before/after values;
- affected recipes, products, opportunities, unlocks, and scenarios;
- compatibility or migration requirements;
- unresolved questions;
- acceptance evidence that became stale.

Approval applies to an exact content revision or digest. Later changes require another review.

## Recommended repository shape

Adopt this incrementally. Exact names may change before implementation, but authority and generated-file boundaries should remain explicit.

```text
game-spec/
  schemas/
  decisions/
  domain/
    chip-properties/
    components/
    machines/
    recipes/
    metrics/
    constraints/
    progression/
    economy/
    interactions/
  protocol/
    commands/
    observations/
    events/
    errors/
  scenarios/
    semantic/
    black-box/
  fixtures/
  reference-environments/
  compatibility/
  generated/
code-factory/
  schemas/
  direction-packets/
  policy/
```

Recommended rules:

- Files outside `generated/` are reviewed source inputs.
- `generated/` contains catalogs, diagrams, tables, indexes, coverage reports, and documentation produced deterministically from source inputs.
- Generated files carry a generator version and source digest and are never edited by hand.
- Evidence bundles normally live in immutable artifact storage; small stable manifests or regression traces may be committed.
- Game-domain schemas, scenarios, fixtures, and reference environments live under `game-spec/`. Factory policy, packet schemas, and direction packets live under `code-factory/`.
- Direction packets reference exact specification and repository revisions. They do not restate domain rules.

### Specification digest

Define one repository command that writes a committed specification manifest. The aggregate specification digest covers reviewed source files under `game-spec/` and excludes `game-spec/generated/`.

The manifest declares:

- digest algorithm and manifest-format version;
- canonical line-ending and serialization rules;
- sorted relative source paths;
- each source file's content digest;
- aggregate digest.

Regenerating derived views does not change the specification digest. Changing a reviewed source does. Review and direction-packet approval pin the aggregate digest, and any agent must be able to reproduce it with the declared command.

## Common record contract

Every normative record should have:

| Field | Requirement |
| --- | --- |
| Stable ID | Unique, never reused for a different concept, and independent of display name or file path |
| Schema version | Selects the structural contract used to parse the record |
| Content revision | Changes when semantics change; immutable releases use a digest |
| Status | For example `draft`, `in_review`, `approved`, `deprecated`, or `removed` |
| Display text | Player-facing name or localization key, separate from identity |
| Typed references | Fields name the target kind, not an untyped string whose meaning depends on context |
| Units | Every dimensional number carries a supported canonical unit |
| Provenance | Decision records and source sections that authorize the value |
| Compatibility | Supersession, migration, and supported-version behavior |
| Examples | Valid fixtures and important invalid cases |

Authored records should use one declared convention, recommended as YAML with `snake_case` fields. JSON remains appropriate for emitted manifests, evidence, replay artifacts, and wire payloads. The common identity, version, status, provenance, and compatibility contract also governs scenarios, protocol definitions, and reference environments; shorter JSON examples in the surrounding design documents illustrate payload shape rather than exempt records from this contract.

Reserve new IDs through one registry validated as a serialized ownership point. Parallel agents may propose additions, but integration rejects duplicate or conflicting allocations.

### Identifiers and references

Preserve existing catalog IDs such as `CP-110`, `MD-110`, `ASM-100`, and `INS-100` when they refer to the same approved concepts. Define namespaced specification IDs around them, for example:

```yaml
id: component.CP-110
kind: component
catalog_id: CP-110
```

References should declare their target type:

```yaml
output:
  item_ref: item.unconnected-package
machine_requirement:
  capability_ref: capability.die-placement.gen1
```

Validation rejects a reference to the wrong kind even if an ID with that spelling exists. Renaming a display label does not rename the stable ID. Removing an ID requires a deprecation window or explicit migration.

### Units, enums, and formulas

- Use a closed unit registry such as `watt`, `gigabyte`, `gigabyte_per_second`, `square_millimeter`, `second`, `usd`, and `item`.
- Choose one canonical storage representation per dimension and generate display conversions.
- Do not encode units in field names alone or mix bare values such as `1.5` seconds and milliseconds.
- Use versioned enums for states, failure reasons, item grades, sourcing modes, and evidence types.
- Unknown enum values fail explicitly unless a compatibility rule defines their handling.
- Formula inputs, output unit, rounding, bounds, and invalid-input behavior are normative.
- Defaults are declared in the schema and generated documentation. Behavior-changing implicit defaults are prohibited.

### Versioning and compatibility

Separate:

- schema version: structure and parsing;
- content revision: game data and balance;
- protocol version: command and observation semantics;
- scenario version: setup, goals, budgets, and checks;
- environment revision: toolchain and runtime;
- repository revision: implementation.

A change report classifies each change as:

- additive and backward compatible;
- compatible with regeneration;
- requires data migration;
- invalidates replays or fixtures;
- intentionally incompatible.

Never silently reinterpret an old command, save, replay, or direction packet under new semantics.

## Domain specification classes

### Chip properties and components

Specify raw properties, not only prose labels or derived marketing categories:

- dimensions and package footprint;
- compute, memory, I/O, power, and thermal capabilities;
- placement and connection requirements;
- supplier compatibility and quality grades;
- workload and risk contributions;
- approved sourcing modes;
- player-facing descriptions.

Derived values such as sustained compute or thermal headroom reference metric definitions rather than copying formulas into component records.

```yaml
schema_version: 1
id: component.MD-110
content_revision: 1
status: draft
catalog_id: MD-110
family: memory_die
display_name: 1 GB LPDDR Memory
properties:
  capacity: {value: 1, unit: gigabyte}
  peak_bandwidth: {value: 12.8, unit: gigabyte_per_second}
  typical_power: {value: 1.5, unit: watt}
footprint: {width: 1, height: 3, unit: design_cell}
compatibility:
  supersedes: null
  replaced_by: null
provenance:
  decisions: []
  sources: [docs/component-catalog.md#starter-memory-dies]
```

These values are provisional starter-catalog candidates until the game designer approves their balance intent.

### Machines

Machine records define capabilities and physical behavior, not one prescribed factory layout:

- footprint, rotation, ports, buffers, and allowed item kinds;
- capabilities and compatible recipe versions;
- cycle or capacity model;
- capital and operating costs;
- quality, reliability, utility, and staffing effects where approved;
- blocked, starved, working, setup, and failure behavior;
- progression availability and replacement compatibility.

Presentation-specific scene names, UI object paths, and engine component types do not belong in the product-domain record. An implementation mapping may reference the machine ID separately.

### Recipes and routes

A recipe declares:

- typed inputs, quantities, quality constraints, and consumption point;
- output and quantity;
- capability requirements;
- setup and processing behavior;
- cost and workload;
- deterministic or seeded yield model;
- every reject, byproduct, rework, and scrap output;
- supported recipe and content versions.

A route requirement declares item origin and destination roles, directionality, capacity assumptions, and failure behavior. It should express required flow, not prescribe coordinates unless coordinates are the mechanic.

For Chip City, purchased and internally produced `MD-110` should satisfy the same compatible item requirement unless the designer approves a quality or qualification distinction.

### Metrics and constraints

Metrics specify:

- typed inputs and output;
- formula or named algorithm;
- units and precision;
- bounds and invalid states;
- expected versus observed interpretation;
- explanation inputs shown to players.

Constraints specify:

- scope;
- predicate;
- severity;
- stable failure code;
- player-facing explanation requirements;
- related entities or locations;
- whether failure blocks submission, production, qualification, or only warns.

The current formulas in [manufacturing metrics](../manufacturing-metrics.md) are useful candidates, not automatically final balance.

### Unlocks and progression

Specify capability prerequisites, evidence requirements, costs, qualification, unlocked records, supplier availability, and failure or waiting states. Keep the intended one-campus first release and its thermal, memory, substrate/interconnect, and advanced-packaging scope distinct from deferred internal I/O, power, compute, upstream materials, multi-site production, and freight.

Graph validation should prove:

- prerequisites are acyclic;
- every required node is reachable from a supported start;
- content does not become usable before required qualification;
- supplier sourcing is not silently removed;
- a deprecated node has a migration path.

### Economy

Specify currency, charge timing, allocation rules, refunds, revenue recognition, inventory valuation where needed, and conservation invariants. Separate:

- supplier spending;
- internal materials and operating cost;
- capital investment;
- reject loss;
- revenue;
- expected cost and margin;
- observed cost and profit.

Every attempted package must charge consumed inputs exactly once, and rejected output must never earn final-product revenue or satisfy accepted-unit demand.

### Interactions

Interaction specifications describe player intent, available actions, preconditions, feedback, disabled reasons, failure recovery, accessibility semantics, and links to protocol commands and observations. They do not encode a particular UI framework.

The candidate onboarding in [first user interaction](../first-user-interaction.md) is a strong source for interactions such as reading an opportunity, submitting a design, placing and connecting machines, routing rejects, diagnosing starvation or blocking, and comparing expected with observed results. Its open questions remain decisions, not defaults.

## Player protocol, deterministic simulation, and replay

The [player protocol](player-protocol.md) is authoritative for human and agent action parity.

Complete it through the same authoring loop:

1. inventory every meaningful human mutation;
2. define one typed semantic command per bounded player intent;
3. define atomic validation and stable error codes;
4. define public observations, focused queries, and deltas;
5. define domain events and causality;
6. map human, semantic-agent, and replay adapters to the same commands;
7. keep oracle access test-only;
8. version serialization and compatibility.

Headless simulation requirements must state:

- fixed tick rules and ordering;
- seeded random streams or intentional absence of randomness;
- deterministic iteration and numeric behavior;
- pause, speed, and step semantics;
- authoritative state serialization;
- checkpoint state hashing;
- separation from rendering, animation completion, and wall-clock time;
- supported reference environment and determinism tolerance;
- explicit failure for unsupported save or replay versions.

A replay pins game, content, protocol, scenario, environment, seed, and initial-state revisions. It records ordered accepted and rejected commands plus checkpoint hashes. Rejected commands remain useful usability evidence but do not mutate state.

The current browser greybox already has deterministic engine calculations and golden scenarios. They can seed formulas, fixtures, error behavior, and reference traces. They do **not** make `engine.js`, the static browser stack, aggregate design kits, generic tracks, fixed route, simplified machine set, or current balance the production architecture or final product truth. Any promoted rule needs provenance and explicit design approval.

## Scenarios, environments, acceptance, and evidence

Use several complementary artifacts.

### Semantic scenarios

Semantic scenarios use only public commands and observations. They define:

- initial scenario or snapshot;
- player knowledge;
- goals and invariants;
- command and simulation-time budgets;
- required explanations;
- allowed content and protocol versions;
- oracle checks evaluated separately.

They do not prescribe one command sequence. Reference traces are fixtures, not the only valid strategy.

### Black-box scenarios

Black-box scenarios use rendered output, accessibility semantics, and ordinary controls. They define supported resolution and input mode, observable task, evidence captures, usability assertions, and recovery expectations. They cannot call semantic commands directly.

### Reference environments

Each environment record pins operating system, architecture, runtime or engine, packages, locale, time zone, numeric mode, display settings where relevant, and tool versions. Performance or visual evidence from an unpinned environment cannot satisfy acceptance.

### Acceptance checks

Each normative requirement has one or more checks at the cheapest reliable layer:

- schema and reference validation;
- deterministic domain or property test;
- integration test;
- semantic scenario;
- black-box scenario;
- performance measurement;
- provenance or asset validation;
- human review for feel or aesthetics.

An agent may add checks. It may not remove, weaken, or rewrite a failing requirement to make the candidate pass.

### Evidence

Evidence links a requirement to:

- exact specification, repository, content, protocol, scenario, and environment revisions;
- check result;
- seed and initial state;
- command or input trace;
- checkpoint hashes;
- logs, metrics, screenshots, or recordings;
- warnings, known risks, and explicit dispositions.

Oracle checks may inspect authoritative hidden state for evaluation. Playing agents cannot query them, and oracle values must not leak into observations or fixtures used as player knowledge.

## Direction packets reference; they do not redefine

A [direction packet](direction-packet.md) authorizes a bounded implementation epoch. It should reference:

- exact approved specification digest;
- stable requirement and scenario IDs;
- exact repository and policy revisions;
- milestone outcomes;
- verification suites and reference environments;
- explicit included and excluded scope;
- approved provisional decisions;
- budgets, authority classes, stop conditions, and checkpoint owner.

It should not copy component values, formulas, command semantics, recipe details, or acceptance logic. Duplication allows intent to diverge. If a product rule must change, change and approve the source specification first, then create a packet revision referencing it.

## Incremental migration from current prose

Do not attempt a giant rewrite.

1. **Inventory assertions and questions.** Mark each prose statement as approved direction, provisional value, example, implementation description, acceptance requirement, or open question.
2. **Choose one vertical slice.** Start with the basic display-controller package from [first user interaction](../first-user-interaction.md).
3. **Create IDs before moving values.** Establish component, item, machine, capability, recipe, metric, constraint, interaction, and scenario IDs.
4. **Extract one source class at a time.** Move starter components, then machine capabilities, recipe flow, metrics, constraints, and scenario setup.
5. **Keep prose as explanatory views.** Replace authoritative duplicated tables with generated tables only after generation is reliable.
6. **Run old and new representations together.** Compare extracted data against existing greybox golden values and documented examples.
7. **Resolve mismatches explicitly.** Classify each as extraction error, intentional spike difference, provisional full-game value, or product decision.
8. **Promote only reviewed records.** Unresolved fields remain `draft`. Open questions may appear in an approved packet only by stable reference, with their affected scope explicitly parked; they cannot back a `must` requirement or enter `scope.included`.
9. **Expand by player outcome.** Add thermal integration, memory qualification and hybrid supply, substrate/interconnect flow, then advanced packaging.
10. **Retire duplicate authority.** Once a generated view replaces a prose table, label the generated source and remove hand-maintained copies.

Migration must preserve the distinction between:

- the current greybox, which validates gameplay questions;
- the candidate next browser spike, which tests the onboarding story;
- the eventual production game, whose engine and architecture remain undecided.

## Suggested Chip City order of work

1. Bootstrap the minimum toolchain: schema validation, typed-reference and unit checks, specification-manifest generation, generated-view stamping, fixtures, and one documented validation command wired into continuous integration.
2. Define the common record contract, ID registry, units, enums, provenance, and compatibility rules.
3. Extract starter items and components: `CP-110`, `MD-110`, `IO-110`, `PM-110`, `TH-110`, `DL-110`, substrates, packaging material, work-in-progress, accepted output, and rejects.
4. Extract starter machine capabilities and player-visible states for receiving, assembly, bonding, inspection, test, packaging, scrap, shipping, storage, and transport.
5. Define the basic display-controller recipe and manufacturing profile without prescribing a factory layout.
6. Define metrics, economy timing, yield sources, constraints, and stable failure codes.
7. Define commands, observations, events, and adapter-equivalence fixtures for the basic design-and-build loop.
8. Define deterministic headless state, tick, snapshot, hash, and replay contracts.
9. Convert the candidate onboarding into semantic and bounded black-box scenarios with a pinned reference environment.
10. Add progression and qualification for thermal integration, then memory and hybrid sourcing, then substrate/interconnect production.
11. Add advanced-packaging capabilities and scenarios while preserving purchased component paths.
12. Draft a direction packet only after its referenced slice is approved and validation-clean.

Until the toolchain exists, records remain `draft`, a named human may record manual checklist results, and no manually checked draft may back an approved direction packet.

## Definition of done by artifact class

| Artifact | Done when |
| --- | --- |
| Specification toolchain | One documented command validates schemas, IDs, typed references, units, fixtures, and the manifest; generation stamps source and generator revisions; continuous integration runs the command |
| Common schema and registry | IDs are unique; types, units, enums, defaults, provenance, versions, and compatibility validate; valid and invalid fixtures exist |
| Components and chip properties | Every player-visible and manufacturing-relevant field is typed; derived values reference metrics; supplier and internal compatibility is explicit; provenance is approved |
| Machines | Footprints, ports, capabilities, buffers, costs, states, and failure behavior are explicit; no presentation-engine details leak into the domain record |
| Recipes and routes | All inputs, consumption points, capabilities, timing, outputs, rejects, byproducts, and failure paths are defined; conservation checks pass |
| Metrics, constraints, and economy | Units, formulas, precision, bounds, charge timing, expected/observed distinction, stable failure codes, and invariants are tested |
| Progression and unlocks | Prerequisites are acyclic and reachable; evidence, costs, qualification, supplier continuity, and migration behavior are explicit |
| Interactions and player protocol | Every human mutation maps to a command; public observations explain available state; errors are stable; adapter parity and serialization tests pass; oracle access is excluded |
| Simulation and replay | Headless outcomes reproduce for pinned inputs; snapshots and hashes are stable; time and randomness are explicit; incompatible versions fail or migrate deliberately |
| Scenarios and environments | Setup, knowledge, goals, invariants, budgets, explanations, oracle checks, evidence, and environment are pinned; semantic and black-box privileges remain separate |
| Direction packet | All references resolve to approved revisions; no copied product rules conflict; scope, authority, budgets, checks, stop conditions, and checkpoint are bounded |
| Generated view | Generator and source digest are recorded; regeneration is deterministic; direct editing is blocked; output is understandable to human reviewers |

## Change and review workflow

For each pull request:

1. Pin the base specification and repository revisions.
2. Link approved decision records and affected stable IDs.
3. Edit source specifications and fixtures.
4. Regenerate derived views.
5. Run structural, semantic, determinism, and affected scenario checks.
6. Produce a semantic change report and compatibility classification.
7. Review domain intent separately from schema mechanics.
8. Apply the change classes from [operations](operations.md#change-authority): classes C, D, and E require their declared human authority, and agents cannot downgrade a change.
9. Merge only current evidence for the exact head revision.
10. Mark downstream direction packets, replays, scenarios, and implementation evidence stale when compatibility analysis requires it.

### Review checklist

- [ ] Does every changed rule have approved provenance?
- [ ] Does every approved decision include an auditable human approval event?
- [ ] Are human product decisions separated from agent drafting?
- [ ] Are stable IDs preserved and typed references resolvable?
- [ ] Are units, enums, defaults, precision, and bounds explicit?
- [ ] Are success, rejection, blocking, and recovery behaviors specified?
- [ ] Are purchased, internal, accepted, rejected, expected, and observed states distinct?
- [ ] Are compatibility, migration, and replay effects declared?
- [ ] Can humans and agents perform equivalent actions through the player protocol?
- [ ] Is hidden oracle state absent from player observations and semantic scenarios?
- [ ] Do scenarios allow multiple valid strategies?
- [ ] Does every acceptance claim point to revision-specific evidence?
- [ ] Are generated files regenerated rather than hand edited?
- [ ] Does the change preserve the greybox/full-game distinction?
- [ ] Are unresolved questions explicit and prevented from entering approved scope?
- [ ] Did any direction packet duplicate rather than reference product intent?

## Handoff template for another agent

Use this prompt after replacing bracketed values:

```text
Act as a specification-authoring agent for Chip City.

Topic: [one bounded product decision or artifact class]
Base repository revision: [full SHA]
Base specification revision: [digest or "not yet established"]
Authoritative sources: [document section links and approved decision IDs]
Allowed source files: [paths]
Generated outputs: [paths or generator command]
Validation commands: [commands]
Explicit exclusions: [out-of-scope mechanics and files]

Follow docs/code-factory/specification-authoring.md. First produce a source card.
If product intent is missing or contradictory, ask exactly one decision question
with explicit options, tradeoffs, affected IDs, and a recommendation. Do not
invent mechanics, hidden defaults, failure behavior, or acceptance criteria.

After decisions are approved, draft the smallest coherent change; update typed
references, fixtures, scenarios, compatibility, and provenance together; run
structural and semantic validation; regenerate views; and report:
- semantic changes;
- affected stable IDs;
- validation and evidence;
- compatibility or migration impact;
- contradictions and unresolved questions;
- files changed.

Do not edit generated artifacts by hand. Do not treat the current browser
prototype as the final architecture or silently promote its balance to product
truth. Do not weaken acceptance to make validation pass.
```

## Pitfalls to reject

| Pitfall | Required response |
| --- | --- |
| Prose masquerading as schema | Extract typed fields, enums, units, references, and explicit unresolved decisions |
| Implementation details in product specs | Move engine, scene, UI-framework, and storage mappings to implementation adapters |
| Duplicate sources of truth | Select one normative record and generate or link every other view |
| Unstable identifiers | Preserve IDs across display-name and file moves; deprecate or migrate removals |
| Hidden defaults | Declare and document defaults or require the field |
| Underspecified failure behavior | Define stable error, affected state, costs, outputs, and recovery |
| Privileged agent-only commands | Remove them from the player adapter or expose an equivalent supported human interaction |
| Nondeterministic authority | Pin seeds and ordering; isolate rendering, wall clock, and provider output |
| Test-only oracle leakage | Separate player and evaluator identities, APIs, fixtures, and evidence |
| Generated artifacts edited by hand | Reject the change and regenerate from reviewed source |
| Golden value, reference trace, or checkpoint hash re-baselined to pass | Treat it as an acceptance or product change requiring human approval and a decision record; agents may not update the expectation merely to make a check pass |
| One reference trace treated as the solution | Keep goal-based scenarios and accept multiple valid strategies |
| Greybox implementation promoted by accident | Record it as evidence or a provisional candidate and obtain product approval |
| Direction packet duplicates product intent | Replace copied mechanics with stable references and exact revisions |

The goal is not to maximize the amount of structured data. It is to create the smallest reviewed specification set that lets another capable agent implement and evaluate the intended player experience without guessing.
