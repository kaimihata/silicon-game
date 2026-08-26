# Code factory architecture

**Status:** Proposed engine-agnostic architecture.

## System shape

The code factory is a controlled pipeline around a conventional game repository. The repository and approved specifications remain authoritative. Agent memory, conversation history, and generated summaries are disposable working context.

```text
approved specifications
        |
        v
specification compiler ----> ambiguity and validation reports
        |
        v
planning agent ------------> versioned task DAG
        |
        +----> code workers --------+
        +----> asset workers -------+
        +----> scene/UI workers ----+--> candidate artifacts
        +----> test workers --------+
                                      |
                                      v
                              integration agent
                                      |
                                      v
                               build candidate
                                      |
                         +------------+------------+
                         |                         |
                  deterministic checks       playtest workers
                         |                         |
                         +------------+------------+
                                      |
                                      v
                              independent evaluator
                                      |
                         accept, revise, or escalate
```

## Architectural layers

### Specification layer

The input layer holds:

- domain and content schemas;
- interaction contracts;
- asset briefs and style constraints;
- technical budgets;
- scenario definitions;
- compatibility and migration rules;
- acceptance criteria;
- explicit unresolved decisions.

Specifications require stable identifiers and versions. References between specifications must be machine validated before implementation tasks are issued.

Free-form documents may explain intent, but executable constraints belong in schemas, formulas, fixtures, or scenario definitions. The specification compiler should reject missing references, incompatible versions, contradictory constraints, and required fields marked as undecided.

### Planning layer

The planner reads an immutable specification revision and repository revision. It produces a task DAG rather than immediately editing the project.

Planning responsibilities include:

- identifying affected systems and artifacts;
- decomposing work into independently verifiable tasks;
- declaring dependencies and integration order;
- selecting worker capabilities;
- attaching requirement identifiers and acceptance criteria;
- estimating risk and requesting human decisions when intent is missing;
- preventing two tasks from owning the same conflict-prone artifact.

Replanning creates a new plan revision. It must not mutate the historical plan that produced an existing candidate.

### Execution layer

Workers receive bounded context and explicit permissions. Each worker operates in an isolated workspace, engine project copy, or asset staging directory.

Workers may produce:

- source-code changes;
- generated data;
- tests and fixtures;
- engine scenes or prefabs;
- models, textures, materials, rigs, animations, audio, or UI assets;
- migration scripts;
- reports that identify a blocked or invalid task.

Workers must not declare requirements satisfied. They report outputs, assumptions, tool versions, validation results, and unresolved issues.

### Integration layer

The integrator is the only agent allowed to assemble a shared build candidate. This avoids nondeterministic corruption of serialized engine files, registries, project settings, and shared scenes.

The integrator:

- verifies candidate lineage and task dependencies;
- rejects stale candidates produced against incompatible revisions;
- merges source changes;
- imports approved staged assets;
- regenerates derived registries through repository tools;
- resolves ownership conflicts by returning tasks for replanning;
- runs the smallest required integration checks;
- emits an immutable build-candidate manifest.

Integration should prefer deterministic generators and engine APIs over manual edits to opaque serialized files.

### Verification layer

Verification combines deterministic checks, semantic playtesting, visual playtesting, performance measurement, and independent evaluation. It produces evidence but does not quietly repair the implementation being evaluated.

Failed checks create structured failure records linked to requirements, artifacts, traces, logs, and reproduction instructions. The planner may then issue repair tasks.

## Authoritative boundaries

The following authority order prevents agents from redefining the product while implementing it:

1. approved specification revision;
2. schema and invariant definitions;
3. acceptance scenarios and expected outcomes;
4. repository implementation;
5. generated plans and task descriptions;
6. worker interpretation.

When two higher-level authorities conflict, the factory stops and requests a human decision. A worker must not choose whichever interpretation makes its task pass.

## Artifact model

Every generated or modified artifact should carry provenance:

```json
{
  "artifactId": "asset.machine.scanner.v3",
  "taskId": "build-scanner-model",
  "specRevision": "design-42",
  "repositoryRevision": "abc123",
  "producer": {
    "agent": "asset-worker",
    "model": "provider/model-version",
    "tools": ["blender-5.0", "asset-validator-2"]
  },
  "inputs": ["brief.machine.scanner.v2"],
  "outputs": ["scanner.blend", "scanner.glb", "turntable.mp4"],
  "checks": ["asset-schema", "scale", "pivot", "lod", "material-budget"],
  "licenses": [],
  "createdAt": "RFC-3339 timestamp"
}
```

Generated assets must record source material, model or service, prompt, seed when available, transformation steps, and license. Assets with unknown provenance cannot advance to integration.

## Asset production

Asset workers should operate from structured briefs containing:

- intended function and visual hierarchy;
- dimensions, coordinate system, pivot, and attachment points;
- style references and prohibited traits;
- material and texture constraints;
- animation and state requirements;
- collision, navigation, LOD, and performance budgets;
- required renders and validation views.

Prefer reproducible procedural tools, such as Blender scripts, for base geometry and transformations. Generative services may produce candidates, but their output still passes technical validation, provenance checks, style evaluation, and integration staging.

Approved source assets are immutable. Optimized engine imports are derived artifacts that can be regenerated.

## Isolation and permissions

Workers receive least-privilege access:

| Worker | Typical write scope |
| --- | --- |
| Code worker | Assigned modules and adjacent tests |
| Asset worker | Task staging directory only |
| Scene worker | Assigned additive scene or prefab |
| Test worker | Test code and fixtures, not production behavior |
| Playtest worker | Saves, traces, screenshots, and reports only |
| Evaluator | Evidence and verdict records only |
| Integrator | Shared project through controlled integration operations |

Network access, paid model use, external asset upload, package installation, and destructive project operations require explicit policy. Secrets must be supplied at execution time and must never enter prompts, artifacts, traces, or commits.

## Execution environments

The factory should support three environments:

- **Fast headless:** schemas, unit tests, simulation, planning, and semantic playtests.
- **Engine automation:** imports, scene validation, builds, render captures, and integration tests.
- **Interactive rendering:** black-box playtesting and visual evaluation.

Environment definitions must be versioned and reproducible. A task result is not portable unless its engine, packages, tools, and generated-data versions are known.

## Determinism and reproducibility

Each build or playtest must identify:

```text
specification revision
+ repository revision
+ content revision
+ environment revision
+ seed
+ command trace
= reproducible candidate or run
```

Wall-clock time, unordered iteration, unseeded randomness, and provider-dependent generated output must not affect authoritative simulation results.

## Deferred decisions

The architecture does not yet select:

- Unity, Unreal, Godot, or another production engine;
- a model provider or orchestration framework;
- local, cloud, or hybrid execution;
- a binary-asset storage system;
- a particular 3D generation service;
- a workflow database or message queue.

Those choices should be evaluated against the contracts in this design rather than embedded into them prematurely.
