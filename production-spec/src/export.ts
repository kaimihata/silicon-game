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
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
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
const SOURCE_REMOTE_URL = `https://github.com/${SOURCE_REPOSITORY}.git`;
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

type VerifiedRepositorySource = {
  repositoryRoot: string;
  sourceRepository: string;
  sourceSha: string;
};

export type RepositoryProofPolicy = {
  remoteName: string;
  remoteUrl: string;
  sourceRepository: string;
};

async function fileDigest(path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

export async function compileContent(out: string): Promise<void> {
  return compileContentFromSource(out, ROOT);
}

async function compileContentFromSource(out: string, sourceRoot: string): Promise<void> {
  const catalog = await readYaml(join(sourceRoot, "content/catalog.yaml"));
  await writeText(join(out, "runtime/catalog.json"), `${canonicalJson(catalog)}\n`);
  await writeText(join(out, "runtime/catalog.provenance.json"), `${canonicalJson({
    schema_version: 1,
    status: "ready",
    source: "content/catalog.yaml",
    content_digest: digest(catalog),
    compiler: "@chip-city/production-spec@0.1.0",
  })}\n`);
}

function normalizeRemoteUrl(url: string): string {
  return url.trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function remoteProofEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      key.startsWith("GIT_") ||
      [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "CURL_CA_BUNDLE",
      ].includes(key)
    ) {
      delete environment[key];
    }
  }
  environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GIT_NO_LAZY_FETCH = "1";
  environment.GIT_NO_REPLACE_OBJECTS = "1";
  return environment;
}

export async function verifyRepositorySource(
  sourceSha: string,
  sourceRef: string,
  repositoryRoot: string,
  policy: RepositoryProofPolicy,
): Promise<VerifiedRepositorySource> {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error("--source-sha must be an explicit lowercase 40-hex commit SHA");
  const gitEnvironment = remoteProofEnvironment();
  if (!sourceRef.startsWith("refs/heads/")) {
    throw new Error("--source-ref must be one explicit trusted refs/heads/* ref");
  }
  try {
    await execFileAsync("git", ["check-ref-format", sourceRef], {
      encoding: "utf8",
      env: gitEnvironment,
    });
  } catch {
    throw new Error("--source-ref must be one explicit trusted refs/heads/* ref");
  }
  const { stdout: headOutput } = await execFileAsync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    env: gitEnvironment,
  });
  const head = headOutput.trim();
  if (sourceSha !== head) {
    throw new Error(`--source-sha ${sourceSha} does not match checked-out HEAD ${head}`);
  }
  const { stdout: shallowOutput } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "rev-parse", "--is-shallow-repository"],
    { encoding: "utf8", env: gitEnvironment },
  );
  if (shallowOutput.trim() !== "false") {
    throw new Error("source repository must be a complete non-shallow clone for remote proof");
  }
  const { stdout: originOutput } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "config", "--get-all", `remote.${policy.remoteName}.url`],
    { encoding: "utf8", env: gitEnvironment },
  );
  const remoteUrls = originOutput.trim().split("\n").filter(Boolean);
  if (
    remoteUrls.length !== 1 ||
    normalizeRemoteUrl(remoteUrls[0]!) !== normalizeRemoteUrl(policy.remoteUrl)
  ) {
    throw new Error(
      `${policy.remoteName} does not identify the single authoritative ${policy.sourceRepository} repository`,
    );
  }
  const { stdout: statusOutput } = await execFileAsync(
    "git",
    [
      "-c",
      "core.fsmonitor=false",
      "-C",
      repositoryRoot,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignore-submodules=all",
    ],
    { encoding: "utf8", env: gitEnvironment },
  );
  if (statusOutput.trim()) {
    throw new Error("source repository is not clean relative to the supplied checked-out HEAD");
  }
  let advertisedOutput: string;
  const allowsLocalRemote =
    policy.remoteUrl.startsWith("file://") || isAbsolute(policy.remoteUrl);
  const remoteProofDirectory = await mkdtemp(join(tmpdir(), "chip-city-remote-proof-"));
  try {
    ({ stdout: advertisedOutput } = await execFileAsync(
      "git",
      [
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        "-c",
        `protocol.file.allow=${allowsLocalRemote ? "always" : "never"}`,
        "-c",
        "http.followRedirects=false",
        "ls-remote",
        "--exit-code",
        "--refs",
        policy.remoteUrl,
        sourceRef,
      ],
      {
        cwd: remoteProofDirectory,
        encoding: "utf8",
        env: {
          ...gitEnvironment,
          GIT_CEILING_DIRECTORIES: remoteProofDirectory,
          GIT_DIR: join(remoteProofDirectory, "isolated.git"),
        },
      },
    ));
  } catch {
    throw new Error(`authoritative remote proof is unavailable for ${sourceRef}`);
  } finally {
    await rm(remoteProofDirectory, { recursive: true, force: true });
  }
  const advertisements = advertisedOutput.trim().split("\n").filter(Boolean).map((line) => {
    const [sha, ref, ...extra] = line.split(/\s+/);
    return { sha, ref, extra };
  });
  if (
    advertisements.length !== 1 ||
    advertisements[0]!.extra.length !== 0 ||
    advertisements[0]!.ref !== sourceRef
  ) {
    throw new Error(`authoritative remote proof is ambiguous for ${sourceRef}`);
  }
  if (advertisements[0]!.sha !== sourceSha) {
    throw new Error(
      `--source-sha ${sourceSha} is not the advertised tip of trusted ref ${sourceRef}`,
    );
  }
  return Object.freeze({
    repositoryRoot,
    sourceRepository: policy.sourceRepository,
    sourceSha,
  });
}

export async function verifySourceRepository(
  sourceSha: string,
  sourceRef: string,
  repositoryRoot = resolve(ROOT, ".."),
): Promise<VerifiedRepositorySource> {
  return verifyRepositorySource(sourceSha, sourceRef, repositoryRoot, {
    remoteName: "origin",
    remoteUrl: SOURCE_REMOTE_URL,
    sourceRepository: SOURCE_REPOSITORY,
  });
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
  sourceRoot: string,
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
  await validateFactoryBundleDirectory(root, undefined, sourceRoot);
}

type SourceTreeEntry = {
  mode: string;
  objectSha: string;
  objectType: "blob" | "tree";
  sourcePath: string;
  targetPath?: string;
};

async function readVerifiedGitObject(
  repositoryRoot: string,
  objectSha: string,
  objectType: "blob" | "commit" | "tree",
  gitEnvironment: NodeJS.ProcessEnv,
): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "cat-file", objectType, objectSha],
    {
      encoding: "buffer",
      env: gitEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  const actualObjectSha = createHash("sha1")
    .update(`${objectType} ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
  if (actualObjectSha !== objectSha) {
    throw new Error(`immutable source snapshot ${objectType} object mismatch: ${objectSha}`);
  }
  return bytes;
}

async function materializeVerifiedSourceTree(
  verifiedSource: VerifiedRepositorySource,
  destination: string,
  gitEnvironment: NodeJS.ProcessEnv,
): Promise<void> {
  const commit = await readVerifiedGitObject(
    verifiedSource.repositoryRoot,
    verifiedSource.sourceSha,
    "commit",
    gitEnvironment,
  );
  const treeMatch = /^tree ([0-9a-f]{40})$/m.exec(commit.toString("utf8"));
  if (!treeMatch) throw new Error("verified source commit does not identify one root tree");
  const rootTreeSha = treeMatch[1]!;
  await readVerifiedGitObject(
    verifiedSource.repositoryRoot,
    rootTreeSha,
    "tree",
    gitEnvironment,
  );
  const { stdout } = await execFileAsync(
    "git",
    [
      "-C",
      verifiedSource.repositoryRoot,
      "ls-tree",
      "-r",
      "-t",
      "-z",
      "--full-tree",
      rootTreeSha,
      "--",
      "production-spec",
    ],
    {
      encoding: "utf8",
      env: gitEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const entries: SourceTreeEntry[] = stdout.split("\0").filter(Boolean).map((record) => {
    const match = /^([0-9]{6}) ([^ ]+) ([0-9a-f]{40})\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error("immutable source snapshot contains an invalid Git tree entry");
    const mode = match[1]!;
    const type = match[2]!;
    const objectSha = match[3]!;
    const sourcePath = match[4]!;
    if (
      (type !== "blob" && type !== "tree") ||
      (type === "blob" && mode !== "100644" && mode !== "100755") ||
      (type === "tree" && mode !== "040000") ||
      (sourcePath !== "production-spec" && !sourcePath.startsWith("production-spec/"))
    ) {
      throw new Error(`immutable source snapshot contains an unsupported entry: ${sourcePath}`);
    }
    if (type === "tree") {
      return { mode, objectSha, objectType: type, sourcePath };
    }
    const relativePath = sourcePath.slice("production-spec/".length);
    const segments = relativePath.split("/");
    if (!relativePath || segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error(`immutable source snapshot contains an unsafe path: ${sourcePath}`);
    }
    const targetPath = resolve(destination, relativePath);
    const targetRelative = relative(destination, targetPath);
    if (!targetRelative || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) {
      throw new Error(`immutable source snapshot path escapes its destination: ${sourcePath}`);
    }
    return { mode, objectSha, objectType: type, sourcePath, targetPath };
  });
  if (!entries.length) throw new Error("verified source commit has no production-spec tree");
  const blobs = entries.filter(
    (entry): entry is SourceTreeEntry & { objectType: "blob"; targetPath: string } =>
      entry.objectType === "blob",
  );
  if (!blobs.length) throw new Error("verified production-spec tree contains no files");
  if (new Set(blobs.map((entry) => entry.targetPath)).size !== blobs.length) {
    throw new Error("immutable source snapshot contains duplicate target paths");
  }
  for (let offset = 0; offset < entries.length; offset += 12) {
    const results = await Promise.allSettled(entries.slice(offset, offset + 12).map(async (entry) => {
      const bytes = await readVerifiedGitObject(
        verifiedSource.repositoryRoot,
        entry.objectSha,
        entry.objectType,
        gitEnvironment,
      );
      if (entry.objectType === "tree") return;
      if (!entry.targetPath) {
        throw new Error(`immutable source snapshot blob has no target path: ${entry.sourcePath}`);
      }
      await mkdir(dirname(entry.targetPath), { recursive: true });
      await writeFile(entry.targetPath, bytes);
    }));
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }
}

async function writeBundle(
  root: string,
  verifiedSource: VerifiedRepositorySource,
  sourceRoot: string,
): Promise<ExportResult> {
  const validation = await validateBundle(sourceRoot);
  if (!validation.valid) throw new Error(`Bundle is invalid:\n${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  const manifest = await loadManifest(sourceRoot);
  assertReadyForExport(manifest);
  const data = await loadArtifacts(manifest, sourceRoot);
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
      await cp(join(sourceRoot, artifact.path), join(root, target));
    }
    exportedArtifacts.push({
      source_path: artifact.path,
      target_path: target,
      content_digest: await fileDigest(join(root, target)),
    });
  }
  for (const source of await listFiles(join(sourceRoot, "schemas"), ".json")) {
    const relativeSource = relative(sourceRoot, source);
    const target = targetSchemaPath(join(ROOT, relativeSource));
    await mkdir(dirname(join(root, target)), { recursive: true });
    await cp(source, join(root, target));
    exportedArtifacts.push({
      source_path: relativeSource,
      target_path: target,
      content_digest: await fileDigest(join(root, target)),
    });
  }
  const packetSchemaSource = "packet/vendor/direction-packet-v1.schema.json";
  const packetSchemaTarget = "code-factory/schemas/direction-packet-v1.schema.json";
  await mkdir(dirname(join(root, packetSchemaTarget)), { recursive: true });
  await cp(join(sourceRoot, packetSchemaSource), join(root, packetSchemaTarget));
  exportedArtifacts.push({
    source_path: packetSchemaSource,
    target_path: packetSchemaTarget,
    content_digest: await fileDigest(join(root, packetSchemaTarget)),
  });
  await compileContentFromSource(join(root, "content"), sourceRoot);
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
  const specificationRevision = await specificationDigest(manifest, data, sourceRoot);
  const policyRevision = digest(data.get("policy/first-run.yaml"));
  const importReadmeTarget = "README.specification-import.md";
  await writeText(join(root, importReadmeTarget), await readFile(join(sourceRoot, "handoff/target-import.md"), "utf8"));
  exportedArtifacts.push({
    source_path: "handoff/target-import.md",
    target_path: importReadmeTarget,
    content_digest: await fileDigest(join(root, importReadmeTarget)),
  });
  const licenseTarget = "LICENSE";
  await cp(join(sourceRoot, "target-bootstrap/LICENSE"), join(root, licenseTarget));
  exportedArtifacts.push({
    source_path: "target-bootstrap/LICENSE",
    target_path: licenseTarget,
    content_digest: await fileDigest(join(root, licenseTarget)),
  });
  const factoryBundle = await generateFactoryBundle(
    root,
    manifest,
    specificationRevision,
    sourceRoot,
  );
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
    source_repository: verifiedSource.sourceRepository,
    source_revision: verifiedSource.sourceSha,
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
  await validateCompleteExport(root, exportedArtifacts, sourceRoot);
  return {
    plannerBundleDigest: factoryBundle.digest,
    specificationRevision,
  };
}

async function publishVerifiedBundle(
  out: string,
  verifiedSource: VerifiedRepositorySource,
  reverify: () => Promise<VerifiedRepositorySource>,
): Promise<ExportResult> {
  const destination = resolve(out);
  await assertAbsentOrEmptyDirectory(destination);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(join(dirname(destination), `.${basename(destination)}.tmp-`));
  const snapshotContainer = await mkdtemp(join(tmpdir(), "chip-city-source-snapshot-"));
  const snapshotSpecification = join(snapshotContainer, "production-spec");
  const gitEnvironment = remoteProofEnvironment();
  try {
    await materializeVerifiedSourceTree(
      verifiedSource,
      snapshotSpecification,
      gitEnvironment,
    );
    const result = await writeBundle(
      temporary,
      verifiedSource,
      snapshotSpecification,
    );
    await rm(snapshotContainer, { recursive: true, force: true });
    await reverify();
    await assertAbsentOrEmptyDirectory(destination);
    try {
      await rmdir(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, destination);
    return result;
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const path of [snapshotContainer, temporary]) {
      try {
        await rm(path, { recursive: true, force: true });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        `Export failed: ${error instanceof Error ? error.message : String(error)}; cleanup also failed`,
      );
    }
    throw error;
  }
}

export async function exportBundleFromRepository(
  out: string,
  sourceSha: string,
  sourceRef: string,
  repositoryRoot: string,
  policy: RepositoryProofPolicy,
): Promise<ExportResult> {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error("--source-sha must be an explicit lowercase 40-hex commit SHA");
  const verifiedSource = await verifyRepositorySource(
    sourceSha,
    sourceRef,
    repositoryRoot,
    policy,
  );
  return publishVerifiedBundle(
    out,
    verifiedSource,
    () => verifyRepositorySource(sourceSha, sourceRef, repositoryRoot, policy),
  );
}

export async function exportBundle(
  out: string,
  sourceSha: string,
  sourceRef: string,
): Promise<ExportResult> {
  const verifiedSource = await verifySourceRepository(sourceSha, sourceRef);
  return publishVerifiedBundle(
    out,
    verifiedSource,
    () => verifySourceRepository(sourceSha, sourceRef),
  );
}
