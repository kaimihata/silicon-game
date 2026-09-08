# Ready first-run runbook

This is a prerequisite checklist, not permission to execute.

## A. Review the source bundle

- Checkout the reviewed `kaimihata/silicon-game` SHA.
- From `production-spec/`, run `npm ci`, build, test, and validate.
- Confirm every manifested authored artifact is `ready`; review provisional balance, visuals, and UI framework delegation.
- Record a disposition conforming to `bundle-review-disposition.schema.json`, bound to the exact source SHA, bundle digest, and specification revision. Accepted review means reviewed/exportable and explicitly grants no execution authority.

## B. Upgrade and verify factory authority

- Implement the separate change in `factory-prerequisites.md`.
- Record that the current private-repository plan has no true branch protection. Limit push access to the owner and explicitly selected least-privilege service identities.
- Require independent specification, review, evidence, integration, and workflow checks for the exact current `develop` head SHA. Treat selected-access direct push as accepted residual risk, not as an impossible operation.
- Detect any unexpected `develop` movement, halt integration, invalidate prior candidate/packet/checkpoint/promotion authority, and require full revalidation from the new exact head plus renewed human approval for changed bound digests.
- Test that no service identity can both author and approve or promote.
- Test halt, restart, reconciliation, budget, and stale-evidence paths.
- Test the single checkpoint lifecycle: automated exact-commit gate, candidate generation, named-human personal playtest event, digest-bound factory promotion request, human merge/tag outside factory, and stale-state rejection.

## C. Prepare the private target

- Confirm the existing private `kaimihata/silicon-game-v1` remains accessible to only the owner and named service identities.
- Treat `develop` at `19137ee04ddd5020c3e7520b33a3b819ea4b4348` as the current observed integration snapshot, not a permanent base or execution authority. Runner contracts are landed.
- Limit access to owner and named service identities.
- Verify the existing Unity `6000.3.23f1` URP skeleton and the paths in `target-bootstrap/manifest.yaml`, including complete exported `specifications/` and `code-factory/` trees, `specification-provenance.json`, canonical `README.specification-import.md`, and the exact exported MIT `LICENSE`.
- Verify Unity editor executable digest, template/package provenance, source export provenance, and license source. Validate batch import, URP binding, empty Windows/macOS builds, every imported byte digest, and the landed runner contracts.
- Configure Unity and required checks without adding secrets or paid services outside approval.

## D. Generate and review authority

- Freshly observe the full 40-hex `develop` head immediately before generation, then run `npm run generate:packet -- --base-sha <freshly-observed-target-sha> --out <review-path>`.
- Treat local generation as source-bundle-valid and structurally v1-valid only.
- In deployed preflight, verify the explicit packet base SHA is the observed `develop` head, required workflow checks passed for that exact SHA, imported provenance and every file digest reproduce, specification/policy digests match, and all verification producers compile.
- Validate semantically with the deployed factory validator in addition to the vendored v1 schema.
- Run factory feasibility analysis without dispatch.
- Review scope, 30-day/100-task/500,000-cent limits, 15% contingency, retry limits, concurrency, model default, services, licenses, stops, and two ordered milestones.
- Obtain a separate append-only human approval over the exact packet digest.
- Recheck `develop` immediately before activation and every authority transition. Any unexpected head movement makes the approval stale and requires exact-head revalidation; changed specification or packet bytes require new digest-bound human approval.

## E. Kickoff prerequisites

- Windows GPU runner is factory-managed, healthy, isolated, and benchmarked.
- macOS runner can create and natively smoke-test Universal builds.
- Unity licensing is owner-provided or already approved.
- Evidence uploads go direct to private Blob storage; each artifact is at most 5 GiB, retained 30 days, and represented in factory storage by digest and metadata only.
- `develop` is healthy at the packet base and no incompatible epoch is active.

Only after every item passes and the human separately approves the exact immutable Direction Packet digest may the human choose to activate. Completion of all automated Milestone 2 requirements at one exact commit generates the single candidate checkpoint described by both `checkpoint_required: true` and the packet's `all_milestones_complete` trigger. The factory then stops. The named human personally playtests that candidate and may approve only its exact digest; the factory may then emit only the bound promotion request. A human verifies the head still equals the bound revision, merges that exact `develop` revision to `main`, and creates the requested immutable tag outside factory authority.
