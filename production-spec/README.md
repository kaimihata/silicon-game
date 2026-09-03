# Chip City production specification

**Status: READY — author-complete and exportable, but not executable authority.**

This self-contained bundle specifies the first production-game foundation and a complete purchased-component onboarding vertical slice. It targets a future private `kaimihata/silicon-game-v1` Unity repository and is designed for later import into the existing `kaimihata/silicon-code-factory`. `ready` means the authors consider every manifested artifact complete enough to export and review. It does not approve a Direction Packet, authorize execution, create a repository, permit merge, or permit tagging.

## Authority and precedence

The authored YAML in this bundle is the production contract proposed by its authors. It reconciles the full-game documents in `../docs/`, provisional content in `../content/catalog.js`, schemas, and validated browser behavior. Explicit decisions in [`handoff/supersession-record.md`](handoff/supersession-record.md) supersede the browser spike for this new foundation.

A human bundle-review disposition validates against `schemas/bundle-review-disposition.schema.json` and binds an exact clean source SHA, bundle digest, specification revision, reviewer identity, timestamp, and disposition. `accepted` confirms review of those source bytes only and explicitly carries `execution_authority: false`; it is not required merely to export a ready bundle. The later Direction Packet v1 must identify that same accepted specification revision in `source.specification_revision`; a separate append-only human packet approval must bind the immutable generated packet digest. Only that packet approval can authorize activation under factory policy. Neither artifact substitutes for the other.

## Layout

- `bundle.yaml` — complete authored-artifact manifest.
- `schemas/` — closed Draft 2020-12 schemas.
- `specifications/` — modular product and technical contracts.
- `content/catalog.yaml` — concrete provisional starter runtime content.
- `fixtures/reference/` — authored default design, lot-bound manufacturing plan, protocol, compiled-recipe, and complete-factory golden references.
- `requirements/` — stable requirement IDs, milestones, sources, and checks.
- `scenarios/` — goal-oriented executable acceptance definitions.
- `verification/plan.yaml` — suite, runner, fixture, and structured scenario-assertion contracts.
- `environments/` — headless, Windows reference, and macOS compatibility environments.
- `registries/` — Direction Packet v1-compatible local registries.
- `policy/first-run.yaml` — proposed bounded first-epoch policy.
- `packet/` — pinned current Direction Packet v1 schema and generator config.
- `target-bootstrap/` — validated initial-target manifest and exact MIT license source.
- `handoff/` — no-execution factory prerequisites, runbook, and import contract.
- `skill-draft/` — uninstalled operator-skill source and evaluation prompts.
- `src/`, `tests/` — isolated Node.js 22 and TypeScript tooling.

## Commands

Run from this directory with Node.js 22:

```bash
npm ci
npm run build
npm test
npm run validate
npm run compile -- --out generated/compile-check
npm run export -- --out generated/target-import --source-sha <silicon-game-40-hex-sha>
npm run generate:packet -- --out generated/chip-city-foundation-01.yaml --base-sha <target-40-hex-base-sha>
npm run validate:packet -- --file generated/chip-city-foundation-01.yaml
```

For normal CLI use, `export` requires an explicit source SHA equal to checked-out `HEAD` and rejects any tracked or untracked `production-spec/` change relative to that commit. It writes source repository/SHA plus authored bundle, specification, policy, and per-file digests, the bootstrap contract, the exact MIT license, and canonical `<export-root>/bundle.json` for the factory planner. The planner bundle has its own exact-byte digest and records the same `specification_revision` as generated Direction Packet v1 `source.specification_revision`; it does not contain the external bundle-review disposition. See [`handoff/factory-bundle-export.md`](handoff/factory-bundle-export.md) for the deterministic consolidation and limits. Tests alone use an internal test-only export option against generated test data; no CLI bypass exists. Exportability follows from `ready`; export itself grants no execution authority. `generate:packet` requires an explicit target base SHA and first requires successful full source-bundle validation. There is intentionally no finalized packet in source because the external target repository and initial target commit do not yet exist.

## Validation guarantees

Validation rejects unsafe YAML, schema violations, missing manifest entries, duplicate IDs, missing normative-rule coverage, missing source rules, invalid generated fragments, invalid milestone graphs, incomplete or duplicate check producers, non-independent evaluation, unavailable runner bindings, dishonest scenario claims, unknown fixtures/assertions/environments/metrics/evidence, invalid metric values, catalog/template references, stale compiled recipes, all golden balance drift, unresolved marker text, unsafe factory paths, noncanonical planner files, oversized selections, and unmapped evidence adapters. Canonical JSON uses RFC 8785-compatible serialization and SHA-256 digests.

Local generation proves source-bundle validity and Direction Packet v1 structural schema validity only. It cannot prove a private target revision exists or establish factory semantics. The current private target plan does not provide true branch protection. Before submission, the deployed `silicon-code-factory` must fail closed unless the accepted bundle-review disposition matches the packet specification revision, the packet's exact base SHA equals the observed `develop` head, required workflow checks passed for that SHA, imported provenance and every exported file digest reproduce, specification/policy digests match, verification producers compile, full factory semantic validation passes, and a human separately approves the immutable packet digest. Push access is limited to selected identities, but direct-push bypass remains accepted residual risk; unexpected `develop` movement invalidates authority until full exact-head revalidation and renewed approval of every changed bound digest.

See [`handoff/factory-prerequisites.md`](handoff/factory-prerequisites.md) before any operational use.
