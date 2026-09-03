# Factory game-spec bundle export

`npm run export -- --out <export-root> --source-sha <clean-source-sha>` writes the canonical factory adapter at `<export-root>/bundle.json`. The manifest validates against Draft 2020-12 schema ID `https://schemas.silicon-code-factory.dev/game-spec-bundle-v1.schema.json`. Its `specification_revision` is exactly the revision emitted in Direction Packet v1 `source.specification_revision`; its independent bundle pin is `sha256:` followed by the SHA-256 digest of the exact RFC 8785 `bundle.json` bytes and is supplied to the factory as `PLANNER_SPEC_BUNDLE_DIGEST`. The file has no trailing newline.

The adapter deterministically consolidates authored YAML rather than copying it:

- each specification is a `rule` fragment with the requirements sourced from that specification;
- runtime content is a global `rule`;
- reference designs, factories, recipes, the lot-bound manufacturing plan, and the protocol contract become dedicated canonical fixture fragments;
- protocol wire and target bootstrap contracts remain dedicated authority-sensitive fragments;
- each executable scenario and the full runner/verdict plan become `verification` fragments;
- the check registry is split in source order before either a 100-requirement selector or 65,536-byte limit would be exceeded;
- requirement catalogs and specification/scenario registries become a traceability fragment;
- registries, environments, first-run policy, and Direction Packet generator configuration become a global runner-context fragment.

Every declared source requirement and milestone remains selectable. Empty requirement and milestone selectors mean a global file. All declared selected and unselected files are canonicalized and validated, every path and ID is unique, each `files[].sha256` is `sha256:` plus the lowercase digest of the exact file bytes, each file is at most 65,536 bytes, and a factory selection must remain at or below 512 KiB. The manifest is at most 256 KiB and contains at most 128 files.

Evidence adapters are an exact mapping of every authored evidence registry ID to the factory's closed evidence kinds. Each profile deliberately uses bounded string version `"1"`; numeric versions are invalid. Semantic domain, accounting, persistence, and coverage records are `semantic_playtest_report` outputs of `windows_gpu_semantic`. Content provenance is an `artifact_manifest` from `macos_build`. Captures come only from `windows_gpu_rendered`. The structured runtime accessibility snapshot is a `test_report` from `windows_gpu_rendered`, with a profile identifying runtime roles, names, values, relationships, focus, and disabled states rather than static analysis or image content. Rendered Windows FPS, cold-load, and memory measurements are a `performance_report` from that same rendered runner. Report metadata can be inline; artifact kinds use direct-to-Blob delivery. Retention is 30 days, the hard artifact maximum is 5 GiB, and factory records retain only digest and metadata. Any added, removed, or unmapped authored evidence ID fails export.

The external human bundle-review disposition is intentionally absent from `bundle.json`. It binds the clean source and `specification_revision` separately. `ready`, export, and the planner bundle pin grant no execution, merge, tag, or promotion authority; the factory still requires separate human approval of the immutable Direction Packet digest.
