# Direction Packet v1 generation

`direction-packet.config.yaml` is a complete draft generator input with no fabricated repository revision. `vendor/direction-packet-v1.schema.json` is pinned from `kaimihata/silicon-code-factory@742b825e9b9ecf90fb638aae40da91527baa7c57`.

Generate only after the exported specification is present in an existing target commit whose full SHA was freshly observed:

```bash
npm run generate:packet -- \
  --base-sha <explicit-lowercase-40-hex-target-sha> \
  --out generated/chip-city-foundation-01.yaml
npm run validate:packet -- --file generated/chip-city-foundation-01.yaml
```

The generator first requires successful full bundle validation. It computes specification and policy digests, emits one exact rule-fragment scope entry per authorized principal source, expands requirements and milestones, and emits only the registry kinds representable by Direction Packet v1. Because v1 acceptance entries cannot carry suites, the exported verification plan and check registry are pinned by the specification digest; the factory planner/compiler must consume them and fail closed when a producer, evaluator, runner contract, fixture, or required evidence kind is unavailable.

Local generation establishes source-bundle validity and structural conformance to the vendored v1 schema. It does not establish deployed factory semantic validity or verify the private target. The current target plan has no true branch protection. Factory preflight must prove the base SHA is the observed `develop` head, required workflow checks passed for that exact SHA, it contains the exported provenance, and every exported byte digest plus the specification and policy digests match before submission. Unexpected head movement invalidates the packet authority until the new exact head is revalidated and any changed packet digest receives new human approval.
