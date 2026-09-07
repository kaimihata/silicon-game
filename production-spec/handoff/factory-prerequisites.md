# Silicon Code Factory prerequisites — no execution

**Ready handoff, not execution authority. Do not submit, approve, activate, dispatch, merge, tag, or create repositories from this document.**

Read-only inspection pinned the current factory contract at `kaimihata/silicon-code-factory@742b825e9b9ecf90fb638aae40da91527baa7c57`. Direction Packet v1 is single-target-repository, uses target-local registries, prohibits unknown fields, and separates packet approval from epoch lifecycle. The existing factory currently stops at candidate-ready and prohibits autonomous merges.

The private Unity target exists, its runner contracts are landed, and its current observed integration snapshot is `develop` at `19137ee04ddd5020c3e7520b33a3b819ea4b4348`. This recorded observation is context only. Every packet and authority transition must freshly observe `develop`, bind the explicit current SHA, and reject movement; the snapshot is not permanent canonical authority.

The private target's current repository plan does not provide true branch protection. Before this bundle can be used, a **separate human-reviewed factory change** must:

1. Add policy-bounded integration support for independently reviewed, current-head PRs into `develop`. Require workflow checks against the exact proposed head SHA before every factory integration; workflow status is a control, not branch protection.
2. Limit push access to the owner and explicitly selected least-privilege service identities. Preserve author/reviewer/evaluator separation, immutable evidence, merge serialization, stale-check invalidation, stop enforcement, and exact packet/policy/source revisions.
3. Treat `develop` as the continuously integrated candidate branch for this target. Direction Packet v1's closed `main_branch_unhealthy` event maps by explicit reviewed factory policy to failed workflow checks or unexpected integration-head movement.
4. Implement one noncircular transition: after all automated Milestone 2 requirements pass at one exact `develop` commit, generate one candidate checkpoint over the exact evidence, packet, specification, and policy digests. Human approval is not a generation prerequisite.
5. Add a post-checkpoint interface event through which the named human records a personal playtest approval bound to only that candidate checkpoint digest.
6. After that event only, let the factory emit `promotion_request` conforming to the bundled schema and bound to the exact develop revision, checkpoint, packet approval, specification, policy, evidence, and requested tag. The factory has no merge or tag authority; a human performs both actions outside the factory and separately records their result.
7. Reject candidate generation or promotion request when develop head, commit, ancestry, evidence, packet, specification, policy, checkpoint, or approval digest is missing, changed, stale, or already consumed. Unexpected movement of `develop` invalidates all authority bound to its prior head until full exact-head workflow, provenance, evidence, packet, and approval revalidation completes.
8. Provision and verify a factory-managed self-hosted Windows 11 GPU runner meeting the reference floor for the first epoch's semantic and rendered suites. Hosted macOS must produce the Universal build and native launch smoke evidence.
9. Verify all service identities against the private target with least privilege and no broad owner credential.
10. Before packet submission, prove the supplied 40-hex target SHA is the observed `develop` head and equals Direction Packet `source.base_revision`; verify required workflow checks passed for that exact SHA, its exported provenance, every recorded file digest, specification digest, and policy digest; and reject a detached, substituted, moved, or stale target state.
11. Register the exported specification, scenario, suite, evidence, environment, service, metric, verification-plan, and check-producer entries. The planner/compiler must consume check bindings and fail closed if any producer, independent evaluator, runner, fixture, or evidence kind is unavailable.
12. Run the deployed factory's semantic packet validator in addition to local structural schema validation.
13. Upload large evidence directly to private Blob storage, reject any artifact above 5 GiB, retain it for 30 days, and store only immutable digest and metadata records in the factory. Validate the 24-hour digest/immediate notification policy.
14. Gate every Milestone 2 task behind current independent evidence for all Milestone 1 requirements, not merely author completion or candidate creation.

This prerequisite changes factory authority and therefore requires its own human approval, tests, threat review, rollout, and rollback plan. This bundle cannot grant that authority.

The remaining direct-push bypass is explicit accepted residual risk: any identity with selected push access can move `develop` without satisfying workflow checks. Detection does not make that impossible. The compensating control is immediate authority invalidation, halted integration, complete revalidation from the new exact head, and renewed human approval for every changed immutable specification or packet digest. Only a human may merge the exact promotion-bound revision to `main` and create the immutable tag.
