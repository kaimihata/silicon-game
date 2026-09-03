# Imported Chip City ready specification

This directory set was generated from `kaimihata/silicon-game/production-spec`. Its adjacent `specification-provenance.json` is authoritative for source repository, exact source SHA, bundle digest, specification revision, policy revision, and exported source paths.

The import is author-complete and exportable. It is not a submitted or approved Direction Packet and does not activate a factory epoch.

Before editing or running:

1. Verify the recorded source SHA equals that repository's checked-out commit, `production-spec/` was clean at export, and provenance digests reproduce by rebuilding that exact source.
2. Create the initial target only by explicit human action. Its exact contents are the Unity `6000.3.23f1` URP skeleton directories/files listed in `target-bootstrap/manifest.yaml`, the complete exported `specifications/` and `code-factory/` trees, `specification-provenance.json`, and the exported MIT `LICENSE`; no gameplay code, generated binaries, secrets, or unrelated assets belong in the bootstrap commit.
3. Create the Unity skeleton with Unity Hub or Unity command line using editor `6000.3.23f1` and the URP template. Record the editor executable digest, template identity, package manifest/lock, source export digest, and license source exactly as the bootstrap manifest requires.
4. Validate batch import, bound URP assets, empty Windows and macOS builds, all specification digests, and exact license bytes before obtaining the initial commit's full 40-hex SHA.
5. Generate Direction Packet v1 using the source tool and explicit base SHA.
6. The current private target plan has no true branch protection. In deployed factory preflight, verify the explicit 40-hex SHA equals both Direction Packet `source.base_revision` and the observed `develop` head; verify required workflow checks passed for that exact SHA, imported provenance is exact, every exported file byte digest matches, specification and policy digests match, and the verification plan/check registry compile with all producers available.
7. Validate the packet structurally with the pinned schema and semantically with the then-deployed factory validator; neither result substitutes for the other.
8. Record a human bundle-review disposition over the exact source/bundle/specification digests. Acceptance does not approve the packet.
9. Complete the separately approved request-only promotion prerequisite.
10. Perform factory feasibility review and obtain a separate human approval over the immutable packet digest before activation.

Push access is limited to the owner and explicitly selected least-privilege service identities, but those identities can still bypass workflow checks by direct push. This is accepted residual risk. Recheck `develop` at every authority transition; unexpected movement invalidates all authority bound to the prior head, halts integration, and requires complete exact-head revalidation plus renewed human approval for changed specification or packet digests. The factory may only request promotion. A human verifies and merges the bound revision to `main` and creates the tag.
