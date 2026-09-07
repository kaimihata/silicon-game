import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { canonicalJson, digest } from "./canonical.js";
import {
  FACTORY_BUNDLE_PATH,
  generateFactoryBundle,
  validateFactoryBundleDirectory,
} from "./factory-bundle.js";
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
const SOURCE_REPOSITORY = "kaimihata/silicon-game";
const execFileAsync = promisify(execFile);

type ExportedArtifact = {
  source_path: string;
  target_path: string;
  content_digest: string;
};

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
  const { stdout: originOutput } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "remote", "get-url", "origin"],
    { encoding: "utf8" },
  );
  const origin = originOutput.trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  if (origin !== `https://github.com/${SOURCE_REPOSITORY}`) {
    throw new Error(`origin ${originOutput.trim()} is not the authoritative ${SOURCE_REPOSITORY} repository`);
  }
  const { stdout: statusOutput } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  );
  if (statusOutput.trim()) {
    throw new Error("source repository is not clean relative to the supplied checked-out HEAD");
  }
}

async function assertAbsentOrEmptyDirectory(path: string): Promise<void> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error(`Export destination must not be a symlink: ${path}`);
    if (!metadata.isDirectory()) throw new Error(`Export destination must be absent or an empty directory: ${path}`);
    if ((await readdir(path)).length !== 0) {
      throw new Error(`Export destination must be absent or empty; refusing stale authority files: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function listExportFiles(directory: string, root = directory): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Export contains a forbidden symlink: ${relative(root, path)}`);
    if (entry.isDirectory()) {
      result.push(...await listExportFiles(path, root));
    } else if (entry.isFile()) {
      result.push(relative(root, path).split(sep).join("/"));
    } else {
      throw new Error(`Export contains a non-regular file: ${relative(root, path)}`);
    }
  }
  return result.sort();
}

async function validateCompleteExport(
  root: string,
  exportedArtifacts: ExportedArtifact[],
): Promise<void> {
  const targetPaths = exportedArtifacts.map((artifact) => artifact.target_path);
  if (new Set(targetPaths).size !== targetPaths.length) {
    throw new Error("Export provenance contains duplicate target paths");
  }
  const expected = [...targetPaths, "specification-provenance.json"].sort();
  const actual = await listExportFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const missing = expected.filter((path) => !actualSet.has(path));
    const extras = actual.filter((path) => !expectedSet.has(path));
    throw new Error(`Export file set mismatch; missing=[${missing.join(",")}], extras=[${extras.join(",")}]`);
  }
  for (const artifact of exportedArtifacts) {
    if (await fileDigest(join(root, artifact.target_path)) !== artifact.content_digest) {
      throw new Error(`Export digest mismatch after generation: ${artifact.target_path}`);
    }
  }
  await validateFactoryBundleDirectory(root);
}

async function writeBundle(root: string, sourceSha: string): Promise<ExportResult> {
  const validation = await validateBundle();
  if (!validation.valid) throw new Error(`Bundle is invalid:\n${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  const manifest = await loadManifest();
  assertReadyForExport(manifest);
  const data = await loadArtifacts(manifest);
  const exportedArtifacts: ExportedArtifact[] = [];
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
      await writeText(join(root, target), stringify(config, { lineWidth: 0 }));
    } else {
      await mkdir(dirname(join(root, target)), { recursive: true });
      await cp(join(ROOT, artifact.path), join(root, target));
    }
    exportedArtifacts.push({
      source_path: artifact.path,
      target_path: target,
      content_digest: await fileDigest(join(root, target)),
    });
  }
  for (const source of await listFiles(join(ROOT, "schemas"), ".json")) {
    const target = targetSchemaPath(source);
    await mkdir(dirname(join(root, target)), { recursive: true });
    await cp(source, join(root, target));
    exportedArtifacts.push({
      source_path: relative(ROOT, source),
      target_path: target,
      content_digest: await fileDigest(join(root, target)),
    });
  }
  const packetSchemaSource = "packet/vendor/direction-packet-v1.schema.json";
  const packetSchemaTarget = "code-factory/schemas/direction-packet-v1.schema.json";
  await mkdir(dirname(join(root, packetSchemaTarget)), { recursive: true });
  await cp(join(ROOT, packetSchemaSource), join(root, packetSchemaTarget));
  exportedArtifacts.push({
    source_path: packetSchemaSource,
    target_path: packetSchemaTarget,
    content_digest: await fileDigest(join(root, packetSchemaTarget)),
  });
  await compileContent(join(root, "content"));
  for (const target of ["content/runtime/catalog.json", "content/runtime/catalog.provenance.json"]) {
    exportedArtifacts.push({
      source_path: "content/catalog.yaml",
      target_path: target,
      content_digest: await fileDigest(join(root, target)),
    });
  }
  const specs = manifest.artifacts
    .filter((artifact) => artifact.kind === "specification")
    .map((artifact) => data.get(artifact.path));
  const requirements = manifest.artifacts
    .filter((artifact) => artifact.kind === "requirements")
    .flatMap((artifact) => data.get(artifact.path).requirements);
  const traceabilityTarget = "specifications/traceability/requirement-fragments.json";
  await writeText(join(root, traceabilityTarget), `${canonicalJson({
    schema_version: 1,
    status: "ready",
    entries: buildRequirementFragmentIndex(specs, requirements),
  })}\n`);
  exportedArtifacts.push({
    source_path: "generated:requirement-fragments",
    target_path: traceabilityTarget,
    content_digest: await fileDigest(join(root, traceabilityTarget)),
  });
  const specificationRevision = await specificationDigest(manifest, data);
  const policyRevision = digest(data.get("policy/first-run.yaml"));
  const importReadmeTarget = "README.specification-import.md";
  await writeText(join(root, importReadmeTarget), await readFile(join(ROOT, "handoff/target-import.md"), "utf8"));
  exportedArtifacts.push({
    source_path: "handoff/target-import.md",
    target_path: importReadmeTarget,
    content_digest: await fileDigest(join(root, importReadmeTarget)),
  });
  const licenseTarget = "LICENSE";
  await cp(join(ROOT, "target-bootstrap/LICENSE"), join(root, licenseTarget));
  exportedArtifacts.push({
    source_path: "target-bootstrap/LICENSE",
    target_path: licenseTarget,
    content_digest: await fileDigest(join(root, licenseTarget)),
  });
  const factoryBundle = await generateFactoryBundle(root, manifest, specificationRevision);
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
  await writeText(join(root, "specification-provenance.json"), `${canonicalJson({
    schema_version: 1,
    status: "ready",
    authority_state: "author_complete_not_executable",
    source_repository: SOURCE_REPOSITORY,
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
  await validateCompleteExport(root, exportedArtifacts);
  return {
    plannerBundleDigest: factoryBundle.digest,
    specificationRevision,
  };
}

export async function exportBundle(out: string, sourceSha: string): Promise<ExportResult> {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error("--source-sha must be an explicit lowercase 40-hex commit SHA");
  await verifySourceRepository(sourceSha);
  const destination = resolve(out);
  await assertAbsentOrEmptyDirectory(destination);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(join(dirname(destination), `.${basename(destination)}.tmp-`));
  try {
    const result = await writeBundle(temporary, sourceSha);
    await verifySourceRepository(sourceSha);
    await assertAbsentOrEmptyDirectory(destination);
    try {
      await rmdir(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, destination);
    return result;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
