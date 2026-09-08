# Imported Chip City ready specification

This directory set was generated from `kaimihata/silicon-game/production-spec`. Its adjacent `specification-provenance.json` is authoritative for source repository, exact source SHA, bundle digest, specification revision, policy revision, and exported source paths.

The import is author-complete and exportable. It is not a submitted or approved Direction Packet and does not activate a factory epoch.

Before editing or running:

1. Verify the recorded source SHA equals that repository's checked-out commit, `production-spec/` was clean at export, and provenance digests reproduce by rebuilding that exact source.
2. Inspect the existing target against the Unity `6000.3.23f1` URP skeleton directories/files listed in `target-bootstrap/manifest.yaml`, the complete exported `specifications/` and `code-factory/` trees, `specification-provenance.json`, canonical `README.specification-import.md`, and the exported MIT `LICENSE`; do not overwrite gameplay code, generated binaries, secrets, or unrelated assets.
3. Verify the existing Unity skeleton was created with editor `6000.3.23f1` and the URP template. Reproduce the editor executable digest, template identity, package manifest/lock, source export digest, and license source exactly as the bootstrap manifest requires.
4. Validate batch import, bound URP assets, empty Windows and macOS builds, landed runner contracts, all specification digests, exact `README.specification-import.md`, and exact license bytes.
5. Generate Direction Packet v1 using the source tool and explicit base SHA.
6. The existing target was observed at `develop` commit `19137ee04ddd5020c3e7520b33a3b819ea4b4348`, but that snapshot is informational and may be stale. The current private target plan has no true branch protection. In deployed factory preflight, freshly observe `develop` and verify the explicit 40-hex SHA equals both Direction Packet `source.base_revision` and that observation; verify required workflow checks passed for that exact SHA, imported provenance is exact, every exported file byte digest matches, specification and policy digests match, and the verification plan/check registry compile with all producers available.
7. Validate the packet structurally with the pinned schema and semantically with the then-deployed factory validator; neither result substitutes for the other.
8. Record a human bundle-review disposition over the exact source/bundle/specification digests. Acceptance does not approve the packet.
9. Complete the separately approved request-only promotion prerequisite.
10. Perform factory feasibility review and obtain a separate human approval over the immutable packet digest before activation.

Push access is limited to the owner and explicitly selected least-privilege service identities, but those identities can still bypass workflow checks by direct push. This is accepted residual risk. Recheck `develop` at every authority transition; unexpected movement invalidates all authority bound to the prior head, halts integration, and requires complete exact-head revalidation plus renewed human approval for changed specification or packet digests. The factory may only request promotion. A human verifies and merges the bound revision to `main` and creates the tag.
