import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { canonicalJson, digest } from "./canonical.js";
import { FACTORY_BUNDLE_PATH, generateFactoryBundle } from "./factory-bundle.js";
import { listFiles, readYaml, ROOT, writeText } from "./io.js";
import { targetPathForArtifact, targetSchemaPath } from "./layout.js";
import {
  assertReadyForExport,
  buildRequirementFragmentIndex,
  loadArtifacts,
  loadManifest,
  specificationDigest,
  validateBundle,
} from "./validate.js";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const execFileAsync = promisify(execFile);

type TestOnlyExportOptions = { testOnlySkipRepositoryVerification: true };
export type ExportResult = {
  plannerBundleDigest: string;
  specificationRevision: string;
};

async function fileDigest(path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

export async function compileContent(out: string): Promise<void> {
  const catalog = await readYaml(join(ROOT, "content/catalog.yaml"));
  await writeText(join(out, "runtime/catalog.json"), `${canonicalJson(catalog)}\n`);
  await writeText(join(out, "runtime/catalog.provenance.json"), `${canonicalJson({
    schema_version: 1,
    status: "ready",
    source: "content/catalog.yaml",
    content_digest: digest(catalog),
    compiler: "@chip-city/production-spec@0.1.0",
  })}\n`);
}

export async function verifySourceRepository(sourceSha: string, repositoryRoot = resolve(ROOT, "..")): Promise<void> {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error("--source-sha must be an explicit lowercase 40-hex commit SHA");
  const { stdout: headOutput } = await execFileAsync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  const head = headOutput.trim();
  if (sourceSha !== head) {
    throw new Error(`--source-sha ${sourceSha} does not match checked-out HEAD ${head}`);
  }
  const { stdout: statusOutput } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all", "--", "production-spec"],
    { encoding: "utf8" },
  );
  if (statusOutput.trim()) {
    throw new Error("production-spec/ is not clean relative to the supplied checked-out HEAD");
  }
}

export async function exportBundle(
  out: string,
  sourceSha: string,
  options?: TestOnlyExportOptions,
): Promise<ExportResult> {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error("--source-sha must be an explicit lowercase 40-hex commit SHA");
  const validation = await validateBundle();
  if (!validation.valid) throw new Error(`Bundle is invalid:\n${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  if (!options?.testOnlySkipRepositoryVerification) await verifySourceRepository(sourceSha);
  const manifest = await loadManifest();
  assertReadyForExport(manifest);
  const data = await loadArtifacts(manifest);
  await mkdir(out, { recursive: true });
  const exportedArtifacts: { source_path: string; target_path: string; content_digest: string }[] = [];
  for (const artifact of manifest.artifacts) {
    const target = targetPathForArtifact(artifact);
    if (artifact.kind === "packet_config") {
      const config = structuredClone(data.get(artifact.path));
      config.requirement_catalogs = config.requirement_catalogs.map((path: string) =>
        targetPathForArtifact(manifest.artifacts.find((candidate) => candidate.path === path)!)
      );
      config.policy = targetPathForArtifact(
        manifest.artifacts.find((candidate) => candidate.path === config.policy)!
      );
      await writeText(join(out, target), stringify(config, { lineWidth: 0 }));
    } else {
      await cp(join(ROOT, artifact.path), join(out, target));
    }
    exportedArtifacts.push({
      source_path: artifact.path,
      target_path: target,
      content_digest: await fileDigest(join(out, target)),
    });
  }
  for (const source of await listFiles(join(ROOT, "schemas"), ".json")) {
    const target = targetSchemaPath(source);
    await cp(source, join(out, target));
    exportedArtifacts.push({
      source_path: relative(ROOT, source),
      target_path: target,
      content_digest: await fileDigest(join(out, target)),
    });
  }
  const packetSchemaSource = "packet/vendor/direction-packet-v1.schema.json";
  const packetSchemaTarget = "code-factory/schemas/direction-packet-v1.schema.json";
  await cp(join(ROOT, packetSchemaSource), join(out, packetSchemaTarget));
  exportedArtifacts.push({
    source_path: packetSchemaSource,
    target_path: packetSchemaTarget,
    content_digest: await fileDigest(join(out, packetSchemaTarget)),
  });
  await compileContent(join(out, "content"));
  for (const target of ["content/runtime/catalog.json", "content/runtime/catalog.provenance.json"]) {
    exportedArtifacts.push({
      source_path: "content/catalog.yaml",
      target_path: target,
      content_digest: await fileDigest(join(out, target)),
    });
  }
  const specs = manifest.artifacts
    .filter((artifact) => artifact.kind === "specification")
    .map((artifact) => data.get(artifact.path));
  const requirements = manifest.artifacts
    .filter((artifact) => artifact.kind === "requirements")
    .flatMap((artifact) => data.get(artifact.path).requirements);
  const traceabilityTarget = "specifications/traceability/requirement-fragments.json";
  await writeText(join(out, traceabilityTarget), `${canonicalJson({
    schema_version: 1,
    status: "ready",
    entries: buildRequirementFragmentIndex(specs, requirements),
  })}\n`);
  exportedArtifacts.push({
    source_path: "generated:requirement-fragments",
    target_path: traceabilityTarget,
    content_digest: await fileDigest(join(out, traceabilityTarget)),
  });
  const specificationRevision = await specificationDigest(manifest, data);
  const policyRevision = digest(data.get("policy/first-run.yaml"));
  const importReadmeTarget = "README.specification-import.md";
  await writeText(join(out, importReadmeTarget), await readFile(join(ROOT, "handoff/target-import.md"), "utf8"));
  exportedArtifacts.push({
    source_path: "handoff/target-import.md",
    target_path: importReadmeTarget,
    content_digest: await fileDigest(join(out, importReadmeTarget)),
  });
  const licenseTarget = "LICENSE";
  await cp(join(ROOT, "target-bootstrap/LICENSE"), join(out, licenseTarget));
  exportedArtifacts.push({
    source_path: "target-bootstrap/LICENSE",
    target_path: licenseTarget,
    content_digest: await fileDigest(join(out, licenseTarget)),
  });
  const factoryBundle = await generateFactoryBundle(out, manifest, specificationRevision);
  for (const file of factoryBundle.bundle.files) {
    exportedArtifacts.push({
      source_path: "generated:factory-bundle",
      target_path: file.path,
      content_digest: file.sha256,
    });
  }
  exportedArtifacts.push({
    source_path: "generated:factory-bundle",
    target_path: FACTORY_BUNDLE_PATH,
    content_digest: factoryBundle.digest,
  });
  await writeText(join(out, "specification-provenance.json"), `${canonicalJson({
    schema_version: 1,
    status: "ready",
    authority_state: "author_complete_not_executable",
    source_repository: "kaimihata/silicon-game",
    source_revision: sourceSha,
    bundle_id: "chip-city-production-foundation",
    bundle_version: "0.1.0",
    bundle_digest: validation.bundleDigest,
    specification_revision: specificationRevision,
    policy_revision: policyRevision,
    planner_bundle: {
      schema_id: "https://schemas.silicon-code-factory.dev/game-spec-bundle-v1.schema.json",
      path: FACTORY_BUNDLE_PATH,
      digest: factoryBundle.digest,
      planner_digest_environment: "PLANNER_SPEC_BUNDLE_DIGEST",
      source_specification_revision: specificationRevision,
      canonicalization: "RFC 8785",
      execution_authority: false,
    },
    human_authority_contracts: {
      bundle_review_disposition_schema: "specifications/schemas/bundle-review-disposition.schema.json",
      relationship: "Accepted bundle review binds this specification revision but grants no execution authority; separate Direction Packet v1 approval must bind the immutable packet digest",
    },
    exported_artifacts: exportedArtifacts.sort((first, second) =>
      first.target_path.localeCompare(second.target_path)
    ),
  })}\n`);
  return {
    plannerBundleDigest: factoryBundle.digest,
    specificationRevision,
  };
}
