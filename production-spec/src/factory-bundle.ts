import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { canonicalJson } from "./canonical.js";
import { readYaml, ROOT, writeText } from "./io.js";

export const FACTORY_BUNDLE_SCHEMA_ID =
  "https://schemas.silicon-code-factory.dev/game-spec-bundle-v1.schema.json";
export const FACTORY_BUNDLE_PATH = "bundle.json";
export const FACTORY_BUNDLE_MAX_BYTES = 256 * 1024;
export const FACTORY_FILE_MAX_BYTES = 64 * 1024;
export const FACTORY_SELECTED_MAX_BYTES = 512 * 1024;
const FACTORY_FRAGMENT_ROOT = "factory-spec";

const FACTORY_ROLES = [
  "rule",
  "fixture",
  "traceability",
  "verification",
  "check",
  "runner",
  "manufacturing_plan",
  "target_bootstrap",
  "protocol_wire",
  "protocol_contract_fixture"
] as const;

type FactoryRole = (typeof FACTORY_ROLES)[number];
type Producer =
  | "windows_gpu_semantic"
  | "windows_gpu_rendered"
  | "macos_build"
  | "macos_smoke";
type FactoryKind =
  | "build_report"
  | "test_report"
  | "typecheck_report"
  | "static_analysis_report"
  | "performance_report"
  | "semantic_playtest_report"
  | "rendered_playtest_recording"
  | "screenshot"
  | "video"
  | "log_bundle"
  | "diff_summary"
  | "review_verdict"
  | "artifact_manifest";

export type FactoryBundleFile = {
  id: string;
  path: string;
  role: FactoryRole;
  media_type: "application/json" | "text/markdown" | "text/plain";
  sha256: string;
  bytes: number;
  requirement_ids: string[];
  milestone_ids: string[];
};

export type EvidenceAdapter = {
  schema_version: 1;
  spec_evidence_id: string;
  factory_kind: FactoryKind;
  profile: {
    id: string;
    version: "1";
    media_type: string;
    json_schema: Record<string, unknown>;
  };
  authorized_producers: Producer[];
  delivery: {
    mode: "inline" | "direct_blob";
    max_bytes: number;
    retention_days: 30;
  };
};

export type GameSpecBundleV1 = {
  schema_version: 1;
  spec_id: string;
  state: "ready";
  specification_revision: string;
  files: FactoryBundleFile[];
  evidence_adapters: EvidenceAdapter[];
};

export function selectFactoryBundleFiles(
  bundle: GameSpecBundleV1,
  requirementIds: string[] = [],
  milestoneIds: string[] = []
): FactoryBundleFile[] {
  if (requirementIds.length > 100 || milestoneIds.length > 100) {
    throw new Error("Factory selection accepts at most 100 requirement and 100 milestone IDs");
  }
  assertUnique(requirementIds, "requested requirement selector");
  assertUnique(milestoneIds, "requested milestone selector");
  const requirementSet = new Set(requirementIds);
  const milestoneSet = new Set(milestoneIds);
  const selected = bundle.files.filter((file) => {
    const global = file.requirement_ids.length === 0 && file.milestone_ids.length === 0;
    return global ||
      file.requirement_ids.some((id) => requirementSet.has(id)) ||
      file.milestone_ids.some((id) => milestoneSet.has(id));
  });
  const selectedBytes = selected.reduce((sum, file) => sum + file.bytes, 0);
  if (selectedBytes > FACTORY_SELECTED_MAX_BYTES) {
    throw new Error(
      `Factory selection is ${selectedBytes} bytes; maximum is ${FACTORY_SELECTED_MAX_BYTES}`
    );
  }
  return selected;
}

type EvidenceMapping = {
  kind: FactoryKind;
  producers: Producer[];
  delivery: "inline" | "direct_blob";
  maxBytes: number;
  profileId?: string;
  profileTitle?: string;
  profileDescription?: string;
};

const evidenceMappings: Record<string, EvidenceMapping> = {
  replay: {
    kind: "log_bundle",
    producers: ["windows_gpu_semantic"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  "decision-trace": {
    kind: "log_bundle",
    producers: ["windows_gpu_semantic", "windows_gpu_rendered"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  "domain-results": {
    kind: "semantic_playtest_report",
    producers: ["windows_gpu_semantic"],
    delivery: "inline",
    maxBytes: 1048576
  },
  "content-provenance": {
    kind: "artifact_manifest",
    producers: ["macos_build"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  "semantic-report": {
    kind: "semantic_playtest_report",
    producers: ["windows_gpu_semantic"],
    delivery: "inline",
    maxBytes: 1048576
  },
  screenshots: {
    kind: "screenshot",
    producers: ["windows_gpu_rendered"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  video: {
    kind: "video",
    producers: ["windows_gpu_rendered"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  "accounting-report": {
    kind: "semantic_playtest_report",
    producers: ["windows_gpu_semantic"],
    delivery: "inline",
    maxBytes: 1048576
  },
  "requirement-coverage": {
    kind: "semantic_playtest_report",
    producers: ["windows_gpu_semantic"],
    delivery: "inline",
    maxBytes: 1048576
  },
  "black-box-recording": {
    kind: "rendered_playtest_recording",
    producers: ["windows_gpu_rendered"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  "accessibility-snapshot": {
    kind: "test_report",
    producers: ["windows_gpu_rendered"],
    delivery: "inline",
    maxBytes: 1048576,
    profileId: "profile.accessibility-snapshot.runtime-semantics",
    profileTitle: "Runtime accessibility semantics snapshot",
    profileDescription:
      "Structured accessibility roles, names, values, relationships, focus, and disabled-state semantics captured by the Windows rendered runtime accessibility runner."
  },
  "performance-report": {
    kind: "performance_report",
    producers: ["windows_gpu_rendered"],
    delivery: "inline",
    maxBytes: 1048576,
    profileId: "profile.performance-report.windows-rendered",
    profileTitle: "Windows rendered performance measurement",
    profileDescription:
      "Rendered Windows reference measurements for frame rate, cold-load duration, and process memory."
  },
  "input-trace": {
    kind: "log_bundle",
    producers: ["windows_gpu_semantic", "windows_gpu_rendered"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  },
  "persistence-results": {
    kind: "semantic_playtest_report",
    producers: ["windows_gpu_semantic"],
    delivery: "inline",
    maxBytes: 1048576
  },
  "audit-log": {
    kind: "log_bundle",
    producers: ["windows_gpu_semantic", "windows_gpu_rendered", "macos_build", "macos_smoke"],
    delivery: "direct_blob",
    maxBytes: 5368709120
  }
};

const producerCompatibility: Record<FactoryKind, Producer[]> = {
  build_report: ["macos_build"],
  test_report: ["windows_gpu_rendered", "macos_smoke"],
  typecheck_report: ["macos_build"],
  static_analysis_report: ["windows_gpu_semantic", "windows_gpu_rendered", "macos_build", "macos_smoke"],
  performance_report: ["windows_gpu_semantic", "windows_gpu_rendered"],
  semantic_playtest_report: ["windows_gpu_semantic"],
  rendered_playtest_recording: ["windows_gpu_rendered"],
  screenshot: ["windows_gpu_rendered", "macos_smoke"],
  video: ["windows_gpu_rendered"],
  log_bundle: ["windows_gpu_semantic", "windows_gpu_rendered", "macos_build", "macos_smoke"],
  diff_summary: ["windows_gpu_semantic", "macos_build"],
  review_verdict: ["windows_gpu_semantic", "macos_smoke"],
  artifact_manifest: ["windows_gpu_semantic", "windows_gpu_rendered", "macos_build", "macos_smoke"]
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
}

function evidenceProfile(
  evidenceId: string,
  mapping: EvidenceMapping
): EvidenceAdapter["profile"] {
  return {
    id: mapping.profileId ?? `profile.${evidenceId}`,
    version: "1",
    media_type: "application/json",
    json_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: mapping.profileTitle ?? `Chip City ${evidenceId} evidence record`,
      description:
        mapping.profileDescription ??
        `Digest-bound metadata record for the authored ${evidenceId} evidence contract.`,
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "evidence_id", "status", "artifacts"],
      properties: {
        schema_version: {const: 1},
        evidence_id: {const: evidenceId},
        status: {enum: ["passed", "failed"]},
        artifacts: {
          type: "array",
          items: {$ref: "#/$defs/artifact"}
        }
      },
      $defs: {
        artifact: {
          type: "object",
          additionalProperties: false,
          required: ["sha256", "bytes"],
          properties: {
            sha256: {type: "string", pattern: "^[0-9a-f]{64}$"},
            bytes: {type: "integer", minimum: 0, maximum: 5368709120},
            blob_uri: {type: "string", format: "uri"}
          }
        }
      }
    }
  };
}

export function buildEvidenceAdapters(evidenceRegistry: any): EvidenceAdapter[] {
  const evidenceIds = uniqueSorted((evidenceRegistry.entries ?? []).map((entry: any) => entry.id));
  const mappedIds = Object.keys(evidenceMappings).sort();
  const missing = evidenceIds.filter((id) => !evidenceMappings[id]);
  const stale = mappedIds.filter((id) => !evidenceIds.includes(id));
  if (missing.length || stale.length) {
    throw new Error(
      `Evidence mapping must be exact; missing=[${missing.join(",")}], stale=[${stale.join(",")}]`
    );
  }
  return evidenceIds.map((specEvidenceId) => {
    const mapping = evidenceMappings[specEvidenceId];
    if (!mapping) throw new Error(`Missing evidence mapping for ${specEvidenceId}`);
    return {
      schema_version: 1,
      spec_evidence_id: specEvidenceId,
      factory_kind: mapping.kind,
      profile: evidenceProfile(specEvidenceId, mapping),
      authorized_producers: [...mapping.producers],
      delivery: {
        mode: mapping.delivery,
        max_bytes: mapping.maxBytes,
        retention_days: 30
      }
    };
  });
}

function assertLocalSchemaRefs(value: unknown, path = "json_schema"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertLocalSchemaRefs(entry, `${path}/${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "$ref" && (typeof nested !== "string" || !nested.startsWith("#/"))) {
      throw new Error(`${path}/$ref must be a local JSON Pointer`);
    }
    assertLocalSchemaRefs(nested, `${path}/${key}`);
  }
}

function assertSafeRelativePath(path: string): void {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..") ||
    posix.normalize(path) !== path
  ) {
    throw new Error(`Unsafe factory bundle path: ${path}`);
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}

async function writeCanonicalFragment(
  exportRoot: string,
  id: string,
  path: string,
  role: FactoryRole,
  value: unknown,
  requirementIds: string[],
  milestoneIds: string[]
): Promise<FactoryBundleFile> {
  assertSafeRelativePath(path);
  const source = canonicalJson(value);
  const bytes = Buffer.byteLength(source);
  if (bytes > FACTORY_FILE_MAX_BYTES) {
    throw new Error(`Factory file ${path} is ${bytes} bytes; maximum is ${FACTORY_FILE_MAX_BYTES}`);
  }
  const destination = resolve(exportRoot, path);
  const rootPrefix = `${resolve(exportRoot)}${sep}`;
  if (!destination.startsWith(rootPrefix)) throw new Error(`Factory file escapes export root: ${path}`);
  await writeText(destination, source);
  return {
    id,
    path,
    role,
    media_type: "application/json",
    sha256: `sha256:${sha256(source)}`,
    bytes,
    requirement_ids: uniqueSorted(requirementIds),
    milestone_ids: uniqueSorted(milestoneIds)
  };
}

function selectorsForRequirements(requirements: any[]): {
  requirementIds: string[];
  milestoneIds: string[];
} {
  return {
    requirementIds: requirements.map((requirement) => requirement.id),
    milestoneIds: requirements.map((requirement) => requirement.milestone)
  };
}

function checkRequirementIndex(requirements: any[]): Map<string, any> {
  const index = new Map<string, any>();
  for (const requirement of requirements) {
    for (const acceptance of requirement.acceptance ?? []) {
      index.set(acceptance.check_id, requirement);
    }
  }
  return index;
}

function makeCheckChunks(checkRegistry: any, requirements: any[]): any[][] {
  const requirementByCheck = checkRequirementIndex(requirements);
  const chunks: any[][] = [];
  let current: any[] = [];
  for (const check of checkRegistry.entries ?? []) {
    const candidate = [...current, check];
    const selectors = uniqueSorted(
      candidate.map((entry) => requirementByCheck.get(entry.id)?.id).filter(Boolean)
    );
    const candidateBytes = Buffer.byteLength(
      canonicalJson({
        schema_version: 1,
        kind: "checks",
        source: {
          id: checkRegistry.id,
          version: checkRegistry.version,
          status: checkRegistry.status
        },
        entries: candidate
      })
    );
    if (current.length && (selectors.length > 100 || candidateBytes > FACTORY_FILE_MAX_BYTES)) {
      chunks.push(current);
      current = [check];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function sourceDocuments(paths: string[]): Promise<any[]> {
  return Promise.all(paths.map((path) => readYaml(resolve(ROOT, path))));
}

async function sourceYaml(path: string): Promise<any> {
  return readYaml(resolve(ROOT, path));
}

async function sourceJson(path: string): Promise<any> {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

export async function generateFactoryBundle(
  exportRoot: string,
  sourceBundle: any,
  specificationRevision: string
): Promise<{bundle: GameSpecBundleV1; digest: string; bytes: number}> {
  const requirementArtifacts = sourceBundle.artifacts.filter(
    (artifact: any) => artifact.kind === "requirements"
  );
  const requirementCatalogs = await sourceDocuments(
    requirementArtifacts.map((artifact: any) => artifact.path)
  );
  const requirements = requirementCatalogs.flatMap((catalog) => catalog.requirements ?? []);
  const requirementsBySpecification = new Map<string, any[]>();
  for (const requirement of requirements) {
    const specification = requirement.source.specification;
    requirementsBySpecification.set(specification, [
      ...(requirementsBySpecification.get(specification) ?? []),
      requirement
    ]);
  }

  const files: FactoryBundleFile[] = [];
  const specificationRegistry = await sourceYaml("registries/specifications.yaml");
  for (const entry of specificationRegistry.entries) {
    const selectedRequirements = requirementsBySpecification.get(entry.id) ?? [];
    const selectors = selectorsForRequirements(selectedRequirements);
    files.push(
      await writeCanonicalFragment(
        exportRoot,
        `rule.${entry.id}`,
        `${FACTORY_FRAGMENT_ROOT}/rules/${entry.id}.json`,
        "rule",
        {
          schema_version: 1,
          kind: "rule",
          specification: await sourceYaml(entry.path),
          requirements: selectedRequirements
        },
        selectors.requirementIds,
        selectors.milestoneIds
      )
    );
  }

  files.push(
    await writeCanonicalFragment(
      exportRoot,
      "rule.runtime-content-catalog",
      `${FACTORY_FRAGMENT_ROOT}/rules/runtime-content-catalog.json`,
      "rule",
      {
        schema_version: 1,
        kind: "runtime_content_catalog",
        catalog: await sourceYaml("content/catalog.yaml")
      },
      [],
      []
    )
  );

  const fixtureDefinitions = [
    {
      id: "fixture.default-qualifying-design",
      path: "fixtures/reference/default-qualifying-design.yaml",
      role: "fixture" as const
    },
    {
      id: "fixture.complete-reference-factory",
      path: "fixtures/reference/complete-reference-factory.yaml",
      role: "fixture" as const
    },
    {
      id: "fixture.default-compiled-recipes",
      path: "fixtures/reference/default-compiled-recipes.yaml",
      role: "fixture" as const
    },
    {
      id: "manufacturing-plan.default",
      path: "fixtures/reference/default-manufacturing-plan.yaml",
      role: "manufacturing_plan" as const
    },
    {
      id: "protocol-contract.player-v1",
      path: "fixtures/reference/player-protocol-v1-contract.yaml",
      role: "protocol_contract_fixture" as const
    }
  ];
  for (const fixture of fixtureDefinitions) {
    files.push(
      await writeCanonicalFragment(
        exportRoot,
        fixture.id,
        `${FACTORY_FRAGMENT_ROOT}/${fixture.role}/${fixture.id}.json`,
        fixture.role,
        {
          schema_version: 1,
          kind: fixture.role,
          fixture: await sourceYaml(fixture.path)
        },
        [],
        []
      )
    );
  }

  files.push(
    await writeCanonicalFragment(
      exportRoot,
      "protocol-wire.v1",
      `${FACTORY_FRAGMENT_ROOT}/protocol/protocol-wire-v1.json`,
      "protocol_wire",
      await sourceJson("schemas/protocol-wire.schema.json"),
      [],
      []
    )
  );
  files.push(
    await writeCanonicalFragment(
      exportRoot,
      "target-bootstrap.unity-6000.3.23f1",
      `${FACTORY_FRAGMENT_ROOT}/target-bootstrap/unity-6000.3.23f1.json`,
      "target_bootstrap",
      {
        schema_version: 1,
        kind: "target_bootstrap",
        manifest: await sourceYaml("target-bootstrap/manifest.yaml"),
        license: await readFile(resolve(ROOT, "target-bootstrap/LICENSE"), "utf8")
      },
      [],
      []
    )
  );

  const scenarioRegistry = await sourceYaml("registries/scenarios.yaml");
  for (const entry of scenarioRegistry.entries) {
    const scenario = await sourceYaml(entry.path);
    files.push(
      await writeCanonicalFragment(
        exportRoot,
        `verification.scenario.${entry.id}`,
        `${FACTORY_FRAGMENT_ROOT}/verification/scenarios/${entry.id}.json`,
        "verification",
        {
          schema_version: 1,
          kind: "acceptance_scenario",
          scenario
        },
        scenario.requirements ?? [],
        [scenario.milestone]
      )
    );
  }
  files.push(
    await writeCanonicalFragment(
      exportRoot,
      "verification.plan",
      `${FACTORY_FRAGMENT_ROOT}/verification/plan.json`,
      "verification",
      {
        schema_version: 1,
        kind: "verification_plan",
        plan: await sourceYaml("verification/plan.yaml")
      },
      [],
      []
    )
  );

  const checkRegistry = await sourceYaml("registries/checks.yaml");
  const requirementByCheck = checkRequirementIndex(requirements);
  const checkChunks = makeCheckChunks(checkRegistry, requirements);
  for (const [index, checks] of checkChunks.entries()) {
    const selectedRequirements = checks
      .map((check) => requirementByCheck.get(check.id))
      .filter(Boolean);
    const selectors = selectorsForRequirements(selectedRequirements);
    files.push(
      await writeCanonicalFragment(
        exportRoot,
        `check.registry.${String(index + 1).padStart(3, "0")}`,
        `${FACTORY_FRAGMENT_ROOT}/checks/check-registry-${String(index + 1).padStart(3, "0")}.json`,
        "check",
        {
          schema_version: 1,
          kind: "checks",
          source: {
            id: checkRegistry.id,
            version: checkRegistry.version,
            status: checkRegistry.status
          },
          entries: checks
        },
        selectors.requirementIds,
        selectors.milestoneIds
      )
    );
  }

  const traceability = {
    schema_version: 1,
    kind: "traceability",
    specification_revision: specificationRevision,
    requirement_catalogs: requirementCatalogs.map((catalog) => ({
      catalog_id: catalog.catalog_id,
      version: catalog.version,
      status: catalog.status,
      milestones: catalog.milestones
    })),
    requirements: requirements.map((requirement) => ({
      id: requirement.id,
      milestone: requirement.milestone,
      source: requirement.source,
      check_ids: (requirement.acceptance ?? []).map((acceptance: any) => acceptance.check_id)
    })),
    specification_registry: specificationRegistry,
    scenario_registry: scenarioRegistry
  };
  files.push(
    await writeCanonicalFragment(
      exportRoot,
      "traceability.requirements",
      `${FACTORY_FRAGMENT_ROOT}/traceability/requirements.json`,
      "traceability",
      traceability,
      [],
      []
    )
  );

  const registryPaths = [
    "registries/actors.yaml",
    "registries/environments.yaml",
    "registries/evidence.yaml",
    "registries/metrics.yaml",
    "registries/scenarios.yaml",
    "registries/services.yaml",
    "registries/specifications.yaml",
    "registries/suites.yaml"
  ];
  const environmentPaths = sourceBundle.artifacts
    .filter((artifact: any) => artifact.kind === "environment")
    .map((artifact: any) => artifact.path);
  const packetConfigPath = sourceBundle.artifacts.find(
    (artifact: any) => artifact.kind === "packet_config"
  )?.path;
  if (!packetConfigPath) throw new Error("Factory bundle requires one packet configuration");
  files.push(
    await writeCanonicalFragment(
      exportRoot,
      "runner.context",
      `${FACTORY_FRAGMENT_ROOT}/runner/context.json`,
      "runner",
      {
        schema_version: 1,
        kind: "runner_context",
        registries: await sourceDocuments(registryPaths),
        environments: await sourceDocuments(environmentPaths),
        policy: await sourceYaml("policy/first-run.yaml"),
        packet_configuration: await sourceYaml(packetConfigPath)
      },
      [],
      []
    )
  );

  files.sort((left, right) => left.path.localeCompare(right.path));
  const evidenceRegistry = await sourceYaml("registries/evidence.yaml");
  const bundle: GameSpecBundleV1 = {
    schema_version: 1,
    spec_id: sourceBundle.bundle_id,
    state: "ready",
    specification_revision: specificationRevision,
    files,
    evidence_adapters: buildEvidenceAdapters(evidenceRegistry)
  };
  await validateFactoryBundleManifest(bundle);
  selectFactoryBundleFiles(bundle);
  for (const requirement of requirements) {
    selectFactoryBundleFiles(bundle, [requirement.id]);
  }
  for (const milestoneId of uniqueSorted(requirements.map((requirement) => requirement.milestone))) {
    selectFactoryBundleFiles(bundle, [], [milestoneId]);
  }
  const source = canonicalJson(bundle);
  const bytes = Buffer.byteLength(source);
  if (bytes > FACTORY_BUNDLE_MAX_BYTES) {
    throw new Error(`bundle.json is ${bytes} bytes; maximum is ${FACTORY_BUNDLE_MAX_BYTES}`);
  }
  await writeText(resolve(exportRoot, FACTORY_BUNDLE_PATH), source);
  await validateFactoryBundleDirectory(exportRoot, bundle);
  return {bundle, digest: `sha256:${sha256(source)}`, bytes};
}

export async function validateFactoryBundleManifest(bundle: unknown): Promise<void> {
  const schema = await sourceJson("schemas/game-spec-bundle-v1.schema.json");
  const ajv = new Ajv2020({allErrors: true, strict: true});
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(bundle)) {
    throw new Error(
      `Invalid game spec bundle: ${(validate.errors ?? [])
        .map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ")}`
    );
  }
  const typed = bundle as GameSpecBundleV1;
  assertUnique(typed.files.map((file) => file.id), "factory file id");
  assertUnique(typed.files.map((file) => file.path), "factory file path");
  for (const file of typed.files) {
    assertSafeRelativePath(file.path);
    assertUnique(file.requirement_ids, `${file.id} requirement selector`);
    assertUnique(file.milestone_ids, `${file.id} milestone selector`);
  }
  assertUnique(
    typed.evidence_adapters.map((adapter) => adapter.spec_evidence_id),
    "evidence adapter"
  );
  for (const adapter of typed.evidence_adapters) {
    const compatible = new Set(producerCompatibility[adapter.factory_kind]);
    const incompatible = adapter.authorized_producers.filter((producer) => !compatible.has(producer));
    if (incompatible.length) {
      throw new Error(
        `${adapter.spec_evidence_id} has incompatible ${adapter.factory_kind} producers: ${incompatible.join(",")}`
      );
    }
    assertLocalSchemaRefs(adapter.profile.json_schema, `${adapter.spec_evidence_id}/profile/json_schema`);
    const profileAjv = new Ajv2020({strict: true});
    addFormats(profileAjv);
    profileAjv.compile(adapter.profile.json_schema);
  }
}

export async function validateFactoryBundleDirectory(
  exportRoot: string,
  bundle?: GameSpecBundleV1
): Promise<GameSpecBundleV1> {
  const bundlePath = resolve(exportRoot, FACTORY_BUNDLE_PATH);
  const bundleBytes = await readFile(bundlePath);
  if (bundleBytes.byteLength > FACTORY_BUNDLE_MAX_BYTES) {
    throw new Error(`bundle.json exceeds ${FACTORY_BUNDLE_MAX_BYTES} bytes`);
  }
  const parsed = JSON.parse(bundleBytes.toString("utf8")) as GameSpecBundleV1;
  const canonical = canonicalJson(parsed);
  if (!bundleBytes.equals(Buffer.from(canonical))) {
    throw new Error("bundle.json is not exact RFC 8785 canonical UTF-8 JSON");
  }
  if (bundle && canonicalJson(bundle) !== canonical) {
    throw new Error("Written bundle.json differs from generated manifest");
  }
  await validateFactoryBundleManifest(parsed);
  for (const file of parsed.files) {
    const bytes = await readFile(resolve(exportRoot, file.path));
    if (bytes.byteLength !== file.bytes) {
      throw new Error(`Factory file byte count mismatch: ${file.path}`);
    }
    if (bytes.byteLength > FACTORY_FILE_MAX_BYTES) {
      throw new Error(`Factory file exceeds ${FACTORY_FILE_MAX_BYTES} bytes: ${file.path}`);
    }
    if (sha256(bytes) !== file.sha256.slice("sha256:".length)) {
      throw new Error(`Factory file digest mismatch: ${file.path}`);
    }
    if (file.media_type === "application/json") {
      const parsedFile = JSON.parse(bytes.toString("utf8"));
      if (!bytes.equals(Buffer.from(canonicalJson(parsedFile)))) {
        throw new Error(`Factory JSON file is not exact canonical JSON: ${file.path}`);
      }
    }
  }
  return parsed;
}
