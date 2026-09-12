# Docs live proof v1

This versioned subtree is a separate, review-required data authority for proving one
exact documentation-only candidate change in `kaimihata/silicon-game-v1`. It is not
part of `production-spec/bundle.yaml`, the game requirement catalogs, the accepted
game artifacts, or `GameSpecBundleV1`.

`contract.json` fixes the only allowed path, change kind, mode, and content digest.
`verification.json` requires independent exact-head hosted-validation and Git-object
blob evidence. Export binds an explicit clean advertised source branch head and an
explicit target base SHA into a closed canonical JSON proof bundle. Export does not
record a reviewer or a review disposition and grants no execution, merge, dispatch,
or deploy authority.

An accepted human review is a separate artifact validated by
`schemas/docs-live-proof-review-disposition-v1.schema.json`. Target base or candidate
head drift invalidates prior evidence and requires re-export and re-review.

The pre-execution bundle review cannot contain a candidate head because planning and
dispatch have not happened yet. After execution, an optional human candidate-evidence
review validates against
`schemas/docs-live-proof-candidate-evidence-disposition-v1.schema.json` and binds the
candidate head plus exactly both machine-evidence digests. That review is not packet
approval and cannot merge, dispatch, deploy, or promote. Packet approval and later
promotion remain separate authority events outside this proof bundle.

For the hosted report, `raw_facts.log_sha256` is SHA-256 over the authenticated raw
trusted job-log bytes before that transient log is discarded.
`trusted_log_attestation_digest` is SHA-256 over the exact RFC 8785 canonical
`raw_facts` object bytes with no trailing newline. Each machine report's
`evidence_digest` is SHA-256 over the exact RFC 8785 canonical report object with only
the `evidence_digest` member omitted, also with no trailing newline. The factory's
separate content-addressed storage digest covers the complete stored report bytes. A
conforming evaluator must recompute the canonical attestation and evidence digests,
require distinct producer and evaluator identities, and re-observe the bound target
base and candidate head before accepting either report as current.

The TypeScript API `validateHostedValidateAsDataReport(report, authenticatedLogBytes)`
validates the closed report schema and all three digest computations. The
`trusted_log_attestation_digest` preimage is only `raw_facts`; it does not include the
top-level attestation or evidence digest. The `evidence_digest` preimage omits only
itself and therefore includes `trusted_log_attestation_digest`, avoiding circular
self-inclusion.
