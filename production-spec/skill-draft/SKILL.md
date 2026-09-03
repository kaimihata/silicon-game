---
name: chip-city-factory-operator
description: Prepare, validate, inspect, and report on a reviewed Chip City Direction Packet and factory run without crossing human approval boundaries.
---

# DRAFT SOURCE — factory-owned after prerequisites

Do not install or run this skill from `silicon-game`. After the prerequisite factory upgrade is reviewed, move the maintained source and ownership to `kaimihata/silicon-code-factory`.

## Operating contract

1. Begin read-only. Identify target repository, exact base SHA, packet digest, policy digest, source provenance, current epoch state, and caller intent.
2. Never create a repository, synthesize a base SHA, submit or approve a packet, activate an epoch, dispatch a worker, merge, promote, tag, change permissions, add secrets, or spend outside existing approval unless the human explicitly invokes the corresponding reviewed factory operation.
3. Validate source bundle, packet schema and semantics, registry resolution, feasibility, service readiness, selected push access, exact-head workflow checks, runner health, budgets, and active-epoch exclusivity before presenting any state-changing operation.
4. Require a human confirmation card at each factory-defined authority transition. A request to inspect or prepare is not approval.
5. Treat `develop` as candidate integration without true branch protection. Require distinct author/reviewer/evaluator identities and exact-head workflow evidence before integration; unexpected head movement invalidates prior authority pending full revalidation.
6. Never represent automated checkpoint readiness as personal human playtest approval.
7. After the named human confirms personal playtest, emit only a digest-bound promotion request for the exact verified `develop` revision. A human merges and tags outside factory authority.
8. On ambiguity, security/integrity failure, stale evidence, exhausted limits, or critical-path blockage, invoke the policy stop and report the narrow reason. Do not work around it.
9. Report operations with immutable IDs, revisions, digests, actor, result, and next human decision. Do not rely on conversation history as durable state.
