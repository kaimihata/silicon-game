# Chip City production specification

**Status: READY — author-complete and exportable, but not executable authority.**

This self-contained bundle specifies the first production-game foundation and a complete purchased-component onboarding vertical slice. It targets the existing private `kaimihata/silicon-game-v1` Unity repository and is designed for import into `kaimihata/silicon-code-factory`. The currently observed integration snapshot is `develop` at `19137ee04ddd5020c3e7520b33a3b819ea4b4348`, with runner contracts landed. That observation is informational and never substitutes for a freshly observed explicit packet base SHA. `ready` means the authors consider every manifested artifact complete enough to export and review. It does not approve a Direction Packet, authorize execution, create or modify a repository, permit merge, or permit tagging.

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
- `target-bootstrap/` — validated target-bootstrap manifest and exact MIT license source.
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
npm run export -- --out generated/target-import --source-sha <silicon-game-40-hex-sha> --source-ref <refs/heads/reviewed-ref>
npm run export:docs-proof-v1 -- --out generated/docs-live-proof-v1 --source-sha <silicon-game-40-hex-sha> --source-ref <refs/heads/reviewed-ref> --target-base-sha <silicon-game-v1-40-hex-sha>
npm run validate:docs-proof-v1
npm run validate:docs-proof-v1 -- --bundle generated/docs-live-proof-v1 --source-sha <silicon-game-40-hex-sha> --source-ref <refs/heads/reviewed-ref> --target-base-sha <silicon-game-v1-40-hex-sha>
npm run generate:packet -- --out generated/chip-city-foundation-01.yaml --base-sha <target-40-hex-base-sha>
npm run validate:packet -- --file generated/chip-city-foundation-01.yaml
npm run clean -- --out generated
```

For normal CLI use, `export` requires an explicit source SHA equal to checked-out `HEAD` and an explicit reviewed `refs/heads/*` source ref. It requires a complete non-shallow clone, one canonical `kaimihata/silicon-game` origin URL, a clean repository, and exact proof from the live authoritative remote that the named ref advertises that SHA. Unavailable, ambiguous, fork, pull-request pseudo-ref, stale, or unadvertised proof fails closed. There is no verification bypass. Export rechecks the same proof immediately before publication, writes into a temporary sibling, validates the complete closed regular-file set and all declared digests, rejects symlinks or extras, and atomically publishes only to an absent or empty destination. It writes source repository/SHA plus authored bundle, specification, policy, and per-file digests, the bootstrap contract, canonical `README.specification-import.md`, the exact MIT license, and canonical `<export-root>/bundle.json` for the factory planner. The planner bundle has its own exact-byte digest and records the same `specification_revision` as generated Direction Packet v1 `source.specification_revision`; it does not contain the external bundle-review disposition. See [`handoff/factory-bundle-export.md`](handoff/factory-bundle-export.md) for the deterministic consolidation and limits. Exportability follows from `ready`; export itself grants no execution authority. `generate:packet` requires an explicit freshly observed target base SHA and first requires successful full source-bundle validation. The observed target snapshot is not embedded as permanent packet authority, and there is intentionally no finalized packet in source.

`clean` can remove only `generated/` or one of its relative descendants. It rejects absolute paths, parent traversal, repository or specification roots, outside paths, and any existing symlink in the deletion path.

The parallel [`bundles/docs-live-proof-v1/`](bundles/docs-live-proof-v1/) contract is
not part of `bundle.yaml`, the game requirement catalogs, accepted game artifacts, or
`GameSpecBundleV1`. Its separate exporter permits only one added regular
`docs/live-proof.md` blob with the contracted mode and content digest. It binds an
explicit target base SHA, requires two independent post-dispatch exact-head evidence
reports, and exports only canonical closed-set JSON. Bundle review and optional later
candidate-evidence review are separate human records; no disposition instance is
generated, and neither review grants execution, merge, dispatch, deploy, or promotion
authority.

## Validation guarantees

Validation rejects unsafe YAML, schema violations, missing manifest entries, duplicate IDs, missing normative-rule coverage, missing source rules, invalid generated fragments, invalid milestone graphs, incomplete or duplicate check producers, non-independent evaluation, unavailable runner bindings, dishonest scenario claims, unknown fixtures/assertions/environments/metrics/evidence, invalid metric values, catalog/template references, stale compiled recipes, all golden balance drift, unresolved marker text, unsafe factory paths, noncanonical planner files, oversized selections, and unmapped evidence adapters. Canonical JSON uses RFC 8785-compatible serialization and SHA-256 digests.

Local generation proves source-bundle validity and Direction Packet v1 structural schema validity only. The existing target and landed runner contracts do not establish that any previously observed revision remains current or authorized. The current private target plan does not provide true branch protection. Before submission, the deployed `silicon-code-factory` must freshly observe `develop` and fail closed unless the accepted bundle-review disposition matches the packet specification revision, the packet's explicit exact base SHA equals that observation, required workflow checks passed for that SHA, imported provenance and every exported file digest reproduce, specification/policy digests match, verification producers compile, full factory semantic validation passes, and a human separately approves the immutable packet digest. Push access is limited to selected identities, but direct-push bypass remains accepted residual risk; unexpected `develop` movement invalidates authority until full exact-head revalidation and renewed approval of every changed bound digest.

See [`handoff/factory-prerequisites.md`](handoff/factory-prerequisites.md) before any operational use.
