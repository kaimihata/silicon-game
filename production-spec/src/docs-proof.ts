import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { canonicalJson } from "./canonical.js";
import {
  publishVerifiedProductionSpecExport,
  type RepositoryProofPolicy,
  type VerifiedRepositorySource,
  verifyRepositorySource,
  verifySourceRepository,
} from "./export.js";
import { ROOT } from "./io.js";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_DIRECTORY = "bundles/docs-live-proof-v1";
const CONTRACT_PATH = "proof/contract.json";
const VERIFICATION_PATH = "proof/verification.json";
const BUNDLE_PATH = "proof-bundle.json";
const PROVENANCE_PATH = "proof-provenance.json";
const SCHEMA_DIRECTORY = "schemas";
const TARGET_REPOSITORY = "kaimihata/silicon-game-v1";
const TARGET_REF = "refs/heads/develop";
const ALLOWED_PATH = "docs/live-proof.md";
const ALLOWED_BLOB_OBJECT_ID = "74a349837fcb7e1f8d6fb8cdb015089c66edadce";
const ALLOWED_CONTENT_DIGEST =
  "sha256:1c3cc393ba4b6269bfda95738934ec933990133120dfec373c9e0e1c17959e13";

export const DOCS_PROOF_PROTOCOL_ID = "docs-live-proof-v1";
export const DOCS_PROOF_CONTRACT_ID = "docs-live-proof-contract-v1";
export const DOCS_PROOF_VERIFICATION_ID = "docs-live-proof-verification-v1";
export const DOCS_PROOF_PROVENANCE_ID = "docs-live-proof-provenance-v1";

export const DOCS_PROOF_SCHEMA_PATHS = [
  "schemas/candidate-git-tree-blob-content-v1.schema.json",
  "schemas/docs-live-proof-bundle-v1.schema.json",
  "schemas/docs-live-proof-candidate-evidence-disposition-v1.schema.json",
  "schemas/docs-live-proof-contract-v1.schema.json",
  "schemas/docs-live-proof-provenance-v1.schema.json",
  "schemas/docs-live-proof-review-disposition-v1.schema.json",
  "schemas/docs-live-proof-verification-v1.schema.json",
  "schemas/hosted-validate-as-data-v1.schema.json",
] as const;

export const DOCS_PROOF_PAYLOAD_PATHS = [
  CONTRACT_PATH,
  VERIFICATION_PATH,
  ...DOCS_PROOF_SCHEMA_PATHS,
] as const;

export const DOCS_PROOF_OUTPUT_PATHS = [
  BUNDLE_PATH,
  ...DOCS_PROOF_PAYLOAD_PATHS,
  PROVENANCE_PATH,
] as const;

const AUTHORED_PATHS = [
  "README.md",
  "contract.json",
  "manifest.json",
  "verification.json",
  ...DOCS_PROOF_SCHEMA_PATHS,
] as const;

type FileRecord = {
  path: string;
  media_type: "application/json";
  bytes: number;
  sha256: string;
};

type ExpectedBindings = {
  sourceSha: string;
  sourceRef: string;
  targetBaseSha: string;
};

export type DocsProofExportResult = {
  proofBundleDigest: string;
  contractRevision: string;
  verificationRevision: string;
};

function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function digestAuthenticatedTrustedJobLog(bytes: Uint8Array): string {
  return sha256(bytes);
}

export function digestTrustedLogAttestation(rawFacts: unknown): string {
  return sha256(canonicalJson(rawFacts));
}

export function digestDocsProofEvidenceReport(report: Record<string, unknown>): string {
  const preimage = structuredClone(report);
  delete preimage.evidence_digest;
  return sha256(canonicalJson(preimage));
}

function assertSha(value: string, option: string): void {
  if (!SHA_PATTERN.test(value)) {
    throw new Error(`${option} must be an explicit lowercase 40-hex commit SHA`);
  }
}

function assertSafeOutputPath(path: string): void {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe docs proof path: ${path}`);
  }
}

async function listRegularFiles(directory: string, root = directory): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Docs proof contains a forbidden symlink: ${relative(root, path)}`);
    }
    if (entry.isDirectory()) {
      result.push(...await listRegularFiles(path, root));
    } else if (entry.isFile()) {
      result.push(relative(root, path).split(sep).join("/"));
    } else {
      throw new Error(`Docs proof contains a non-regular file: ${relative(root, path)}`);
    }
  }
  return result.sort();
}

async function readJson(path: string): Promise<any> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Docs proof input is not a regular file: ${path}`);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function readCanonicalJson(path: string): Promise<{ value: any; bytes: Buffer }> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Docs proof output is not a regular file: ${path}`);
  }
  const bytes = await readFile(path);
  let value: any;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Docs proof output is not JSON: ${path}`);
  }
  if (!bytes.equals(Buffer.from(canonicalJson(value)))) {
    throw new Error(`Docs proof output is not exact RFC 8785 canonical JSON: ${path}`);
  }
  return { value, bytes };
}

function makeAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

function validateWithSchema(
  schema: any,
  value: unknown,
  label: string,
): void {
  const validate = makeAjv().compile(schema);
  if (!validate(value)) {
    const details = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "schema error"}`)
      .join("; ");
    throw new Error(`${label} is invalid: ${details}`);
  }
}

export async function validateHostedValidateAsDataReport(
  report: Record<string, unknown>,
  authenticatedRawJobLogBytes: Uint8Array,
  repositoryRoot = ROOT,
): Promise<void> {
  const schema = await readJson(
    join(
      repositoryRoot,
      SOURCE_DIRECTORY,
      SCHEMA_DIRECTORY,
      "hosted-validate-as-data-v1.schema.json",
    ),
  );
  validateWithSchema(schema, report, "Hosted validate-as-data evidence");
  const rawFacts = report.raw_facts as Record<string, unknown>;
  if (rawFacts.log_sha256 !== digestAuthenticatedTrustedJobLog(authenticatedRawJobLogBytes)) {
    throw new Error("Hosted validate-as-data raw_facts.log_sha256 does not match authenticated raw job-log bytes");
  }
  if (report.trusted_log_attestation_digest !== digestTrustedLogAttestation(rawFacts)) {
    throw new Error("Hosted validate-as-data trusted_log_attestation_digest does not match canonical raw_facts");
  }
  if (report.evidence_digest !== digestDocsProofEvidenceReport(report)) {
    throw new Error("Hosted validate-as-data evidence_digest does not match canonical report preimage");
  }
}

function renderContract(template: any, targetBaseSha: string): any {
  assertSha(targetBaseSha, "--target-base-sha");
  const contract = structuredClone(template);
  if (contract?.target?.base_sha_input !== "--target-base-sha") {
    throw new Error("Authored docs proof contract must require --target-base-sha");
  }
  delete contract.target.base_sha_input;
  contract.target.base_sha = targetBaseSha;
  return contract;
}

function assertExactContract(contract: any, targetBaseSha: string): void {
  if (contract.contract_id !== DOCS_PROOF_CONTRACT_ID) {
    throw new Error("Docs proof contract ID is not exact");
  }
  if (
    contract.target?.repository !== TARGET_REPOSITORY ||
    contract.target?.ref !== TARGET_REF ||
    contract.target?.base_sha !== targetBaseSha
  ) {
    throw new Error("Docs proof target repository/ref/base SHA is not exact");
  }
  const policy = contract.change_policy;
  if (policy?.max_changed_paths !== 1 || policy.allowed_changes?.length !== 1) {
    throw new Error("Docs proof must allow exactly one changed path");
  }
  const allowed = policy.allowed_changes[0];
  if (
    allowed?.path !== ALLOWED_PATH ||
    allowed?.change_kind !== "add" ||
    allowed?.mode !== "100644" ||
    allowed?.blob_object_id !== ALLOWED_BLOB_OBJECT_ID ||
    allowed?.content_sha256 !== ALLOWED_CONTENT_DIGEST ||
    allowed?.encoding !== "UTF-8" ||
    allowed?.final_newline !== true
  ) {
    throw new Error("Docs proof sole allowed change is not exact");
  }
  if (
    JSON.stringify(policy.forbidden_change_kinds) !==
      JSON.stringify(["modify", "delete", "rename", "copy"]) ||
    policy.forbid_symlinks !== true ||
    policy.forbid_submodules !== true ||
    policy.forbid_executable_modes !== true
  ) {
    throw new Error("Docs proof forbidden change policy is incomplete");
  }
  const denied = policy.denied_scopes?.map((scope: any) => scope.category).sort();
  if (
    JSON.stringify(denied) !==
    JSON.stringify(["Unity", "dependency", "generated", "runner-lock", "runtime", "source-spec", "workflow"])
  ) {
    throw new Error("Docs proof explanatory denied scopes are incomplete");
  }
  const planning = contract.planning_binding;
  if (
    planning?.source?.type !== "specification" ||
    planning?.source?.id !== DOCS_PROOF_CONTRACT_ID ||
    planning?.acceptance?.check_id !== DOCS_PROOF_CONTRACT_ID ||
    planning?.acceptance?.type !== "docs_proof" ||
    planning?.check_id !== DOCS_PROOF_CONTRACT_ID
  ) {
    throw new Error("Docs proof planning binding is not exact");
  }
  if (
    contract.authority?.execution_authority !== false ||
    contract.authority?.merge_authority !== false ||
    contract.authority?.dispatch_authority !== false ||
    contract.authority?.deploy_authority !== false ||
    contract.authority?.human_review_required !== true
  ) {
    throw new Error("Docs proof contract authority flags are not exact");
  }
}

function assertExactVerification(verification: any): void {
  if (
    verification.verification_id !== DOCS_PROOF_VERIFICATION_ID ||
    verification.exact_head_required !== true ||
    verification.independence?.producer_and_evaluator_must_differ !== true
  ) {
    throw new Error("Docs proof verification identity or exact-head policy is not exact");
  }
  if (verification.evidence_obligations?.length !== 2) {
    throw new Error("Docs proof verification must require exactly two evidence obligations");
  }
  const byId = new Map(
    verification.evidence_obligations.map((obligation: any) => [
      obligation.obligation_id,
      obligation,
    ]),
  );
  const hosted = byId.get("hosted_validate_as_data") as any;
  const tree = byId.get("candidate_git_tree_blob_content") as any;
  if (!hosted || !tree || byId.size !== 2) {
    throw new Error("Docs proof verification evidence obligation set is not exact");
  }
  for (const obligation of [hosted, tree]) {
    if (
      obligation.producer?.role_id !== "trusted_system_collector" ||
      obligation.evaluator?.role_id !== "independent_system_verifier" ||
      obligation.producer.role_id === obligation.evaluator.role_id ||
      obligation.producer.identity_required !== true ||
      obligation.evaluator.identity_required !== true ||
      obligation.evidence_digest_required !== true ||
      !obligation.binding_fields.includes("target_base_sha") ||
      !obligation.binding_fields.includes("candidate_head_sha") ||
      !obligation.freshness.includes("drift invalidates")
    ) {
      throw new Error(`Docs proof evidence obligation is mutable or not independent: ${obligation.obligation_id}`);
    }
  }
  if (
    hosted.artifact_type !== "hosted_validate_as_data_v1" ||
    hosted.report_schema_path !== "schemas/hosted-validate-as-data-v1.schema.json" ||
    hosted.required_result?.workflow_id !== 349570522 ||
    hosted.required_result?.workflow_name !== "Data-only runner contract validation" ||
    hosted.required_result?.workflow_path !== ".github/workflows/runner-contract-validation.yml" ||
    hosted.required_result?.workflow_blob_sha !== "0f66a20943fb86f3cd1bd821aa490fa9716ef0af" ||
    hosted.required_result?.workflow_sha_source !== "authenticated_trusted_job_log" ||
    hosted.required_result?.job !== "validate-as-data" ||
    hosted.required_result?.check_name !== "validate-as-data" ||
    hosted.required_result?.event !== "pull_request_target" ||
    hosted.required_result?.app_id !== 15368 ||
    hosted.required_result?.app_slug !== "github-actions" ||
    hosted.required_result?.conclusion !== "success" ||
    JSON.stringify(hosted.required_result?.runtime_fact_fields) !== JSON.stringify([
      "workflow_job_name",
      "workflow_conclusion",
      "base_sha",
      "head_sha",
      "job_id",
      "run_attempt",
      "workflow_id",
      "workflow_name",
      "check_name",
      "event",
      "app_id",
      "app_slug",
      "log_format_revision",
      "log_sha256",
      "trusted_step_names",
      "candidate_sha",
      "pr_ref",
      "workflow_sha",
      "trusted_controller_sha",
      "base_ref",
      "fetch_head_assertion",
      "validator_argv",
    ]) ||
    hosted.required_result?.log_format_revision !== "docs-live-proof-trusted-job-log-v1" ||
    hosted.required_result?.fetch_head_assertion !==
      "test \"$(git rev-parse FETCH_HEAD)\" = \"$CANDIDATE_SHA\"" ||
    JSON.stringify(hosted.required_result?.validator_argv) !== JSON.stringify([
      "python3",
      "scripts/static_candidate_validator.py",
      "--trusted-sha",
      "$TRUSTED_CONTROLLER_SHA",
      "--candidate-sha",
      "$CANDIDATE_SHA",
    ]) ||
    hosted.required_result?.trusted_step_names?.length !== 5 ||
    hosted.required_result?.digest_semantics?.raw_log_digest !==
      "sha256 of authenticated raw trusted job-log bytes" ||
    hosted.required_result?.digest_semantics?.trusted_log_attestation_digest !==
      "sha256 of exact RFC 8785 raw_facts bytes" ||
    hosted.required_result?.digest_semantics?.evidence_digest !==
      "sha256 of exact RFC 8785 report bytes with only evidence_digest omitted" ||
    JSON.stringify(hosted.immutable_identity_fields) !== JSON.stringify([
      "workflow_id",
      "workflow_repository",
      "workflow_name",
      "workflow_path",
      "workflow_blob_sha",
      "trusted_log_attestation_digest",
      "run_id",
      "run_attempt",
      "check_suite_id",
      "check_run_id",
      "check_name",
      "app_id",
      "app_slug",
      "event",
    ])
  ) {
    throw new Error("Hosted validate-as-data obligation is not exact");
  }
  if (
    tree.artifact_type !== "candidate_git_tree_blob_content_v1" ||
    tree.report_schema_path !== "schemas/candidate-git-tree-blob-content-v1.schema.json" ||
    tree.required_blob?.path !== ALLOWED_PATH ||
    tree.required_blob?.change_kind !== "add" ||
    tree.required_blob?.mode !== "100644" ||
    tree.required_blob?.blob_object_id !== ALLOWED_BLOB_OBJECT_ID ||
    tree.required_blob?.bytes_sha256 !== ALLOWED_CONTENT_DIGEST ||
    tree.required_blob?.encoding !== "UTF-8" ||
    tree.required_blob?.final_newline !== true ||
    JSON.stringify(tree.immutable_identity_fields) !== JSON.stringify([
      "path",
      "change_kind",
      "mode",
      "blob_object_id",
      "bytes",
      "bytes_sha256",
      "encoding",
      "final_newline",
    ])
  ) {
    throw new Error("Candidate Git-tree blob-content obligation is not exact");
  }
}

async function loadSchemas(root: string): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  for (const path of DOCS_PROOF_SCHEMA_PATHS) {
    const schema = await readJson(join(root, path));
    makeAjv().compile(schema);
    result.set(path, schema);
  }
  return result;
}

export async function validateAuthoredDocsProof(
  sourceRoot = ROOT,
  targetBaseSha = "1".repeat(40),
): Promise<void> {
  assertSha(targetBaseSha, "--target-base-sha");
  const root = join(sourceRoot, SOURCE_DIRECTORY);
  const actual = await listRegularFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify([...AUTHORED_PATHS].sort())) {
    throw new Error(`Authored docs proof file set is not exact: ${actual.join(",")}`);
  }
  const manifest = await readJson(join(root, "manifest.json"));
  if (
    manifest.bundle_id !== DOCS_PROOF_PROTOCOL_ID ||
    manifest.state !== "ready" ||
    manifest.canonicalization !== "RFC 8785" ||
    manifest.digest_algorithm !== "sha256" ||
    JSON.stringify(manifest.exported_paths) !== JSON.stringify(DOCS_PROOF_PAYLOAD_PATHS)
  ) {
    throw new Error("Authored docs proof manifest is not exact");
  }
  const schemas = await loadSchemas(root);
  const contract = renderContract(await readJson(join(root, "contract.json")), targetBaseSha);
  const verification = await readJson(join(root, "verification.json"));
  validateWithSchema(
    schemas.get("schemas/docs-live-proof-contract-v1.schema.json"),
    contract,
    "Authored docs proof contract",
  );
  validateWithSchema(
    schemas.get("schemas/docs-live-proof-verification-v1.schema.json"),
    verification,
    "Authored docs proof verification",
  );
  assertExactContract(contract, targetBaseSha);
  assertExactVerification(verification);
}

async function writeCanonicalAtRoot(
  root: string,
  path: string,
  value: unknown,
): Promise<FileRecord> {
  assertSafeOutputPath(path);
  const bytes = Buffer.from(canonicalJson(value));
  const destination = resolve(root, path);
  const prefix = `${resolve(root)}${sep}`;
  if (!destination.startsWith(prefix)) throw new Error(`Docs proof output escapes root: ${path}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return {
    path,
    media_type: "application/json",
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function writeDocsProof(
  root: string,
  verifiedSource: VerifiedRepositorySource,
  snapshotSpecification: string,
  targetBaseSha: string,
): Promise<DocsProofExportResult> {
  await validateAuthoredDocsProof(snapshotSpecification, targetBaseSha);
  const sourceRoot = join(snapshotSpecification, SOURCE_DIRECTORY);
  const contract = renderContract(await readJson(join(sourceRoot, "contract.json")), targetBaseSha);
  const verification = await readJson(join(sourceRoot, "verification.json"));
  const payloads = new Map<string, unknown>([
    [CONTRACT_PATH, contract],
    [VERIFICATION_PATH, verification],
  ]);
  for (const schemaPath of DOCS_PROOF_SCHEMA_PATHS) {
    payloads.set(schemaPath, await readJson(join(sourceRoot, schemaPath)));
  }
  const payloadFiles: FileRecord[] = [];
  for (const path of DOCS_PROOF_PAYLOAD_PATHS) {
    payloadFiles.push(await writeCanonicalAtRoot(root, path, payloads.get(path)));
  }
  const contractRevision = payloadFiles.find((file) => file.path === CONTRACT_PATH)!.sha256;
  const verificationRevision = payloadFiles.find((file) => file.path === VERIFICATION_PATH)!.sha256;
  const proofBundle = {
    schema_version: 1,
    protocol_id: DOCS_PROOF_PROTOCOL_ID,
    state: "ready",
    canonicalization: "RFC 8785",
    digest_algorithm: "sha256",
    contract_revision: contractRevision,
    verification_revision: verificationRevision,
    execution_authority: false,
    human_review_required: true,
    files: payloadFiles,
  };
  const bundleFile = await writeCanonicalAtRoot(root, BUNDLE_PATH, proofBundle);
  const provenance = {
    schema_version: 1,
    provenance_id: DOCS_PROOF_PROVENANCE_ID,
    protocol_id: DOCS_PROOF_PROTOCOL_ID,
    bundle: {
      id: DOCS_PROOF_PROTOCOL_ID,
      path: BUNDLE_PATH,
      digest: bundleFile.sha256,
    },
    contract: {
      id: DOCS_PROOF_CONTRACT_ID,
      path: CONTRACT_PATH,
      digest: contractRevision,
    },
    verification: {
      id: DOCS_PROOF_VERIFICATION_ID,
      path: VERIFICATION_PATH,
      digest: verificationRevision,
    },
    source: {
      repository: verifiedSource.sourceRepository,
      ref: verifiedSource.sourceRef,
      sha: verifiedSource.sourceSha,
    },
    target: {
      repository: TARGET_REPOSITORY,
      ref: TARGET_REF,
      base_sha: targetBaseSha,
    },
    files: [bundleFile, ...payloadFiles].sort((first, second) =>
      first.path.localeCompare(second.path)
    ),
    canonicalization: "RFC 8785",
    digest_algorithm: "sha256",
    execution_authority: false,
    human_review_required: true,
  };
  await writeCanonicalAtRoot(root, PROVENANCE_PATH, provenance);
  await validateDocsProofBundleDirectory(root, {
    sourceSha: verifiedSource.sourceSha,
    sourceRef: verifiedSource.sourceRef,
    targetBaseSha,
  });
  return {
    proofBundleDigest: bundleFile.sha256,
    contractRevision,
    verificationRevision,
  };
}

function assertUniquePaths(files: FileRecord[], label: string): void {
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Error(`${label} contains duplicate paths`);
  }
}

async function assertFileRecords(
  root: string,
  records: FileRecord[],
  expectedPaths: readonly string[],
  label: string,
): Promise<void> {
  assertUniquePaths(records, label);
  const actualPaths = records.map((record) => record.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`${label} file set is not exact`);
  }
  for (const record of records) {
    if (!DIGEST_PATTERN.test(record.sha256) || !Number.isSafeInteger(record.bytes)) {
      throw new Error(`${label} has invalid digest or byte count: ${record.path}`);
    }
    const bytes = await readFile(join(root, record.path));
    if (bytes.byteLength !== record.bytes || sha256(bytes) !== record.sha256) {
      throw new Error(`${label} digest/byte drift: ${record.path}`);
    }
  }
}

export async function validateDocsProofBundleDirectory(
  root: string,
  expected: ExpectedBindings,
): Promise<DocsProofExportResult> {
  assertSha(expected.sourceSha, "--source-sha");
  assertSha(expected.targetBaseSha, "--target-base-sha");
  if (!expected.sourceRef.startsWith("refs/heads/")) {
    throw new Error("--source-ref must be one explicit trusted refs/heads/* ref");
  }
  const actualPaths = await listRegularFiles(root);
  if (JSON.stringify(actualPaths) !== JSON.stringify([...DOCS_PROOF_OUTPUT_PATHS].sort())) {
    throw new Error(`Docs proof output file set is not exact: ${actualPaths.join(",")}`);
  }
  const documents = new Map<string, { value: any; bytes: Buffer }>();
  for (const path of DOCS_PROOF_OUTPUT_PATHS) {
    documents.set(path, await readCanonicalJson(join(root, path)));
  }
  const schemas = new Map<string, any>(
    DOCS_PROOF_SCHEMA_PATHS.map((path) => [path, documents.get(path)!.value]),
  );
  for (const schema of schemas.values()) makeAjv().compile(schema);
  const contract = documents.get(CONTRACT_PATH)!.value;
  const verification = documents.get(VERIFICATION_PATH)!.value;
  const bundle = documents.get(BUNDLE_PATH)!.value;
  const provenance = documents.get(PROVENANCE_PATH)!.value;
  validateWithSchema(
    schemas.get("schemas/docs-live-proof-contract-v1.schema.json"),
    contract,
    "Exported docs proof contract",
  );
  validateWithSchema(
    schemas.get("schemas/docs-live-proof-verification-v1.schema.json"),
    verification,
    "Exported docs proof verification",
  );
  validateWithSchema(
    schemas.get("schemas/docs-live-proof-bundle-v1.schema.json"),
    bundle,
    "Exported docs proof bundle",
  );
  validateWithSchema(
    schemas.get("schemas/docs-live-proof-provenance-v1.schema.json"),
    provenance,
    "Exported docs proof provenance",
  );
  assertExactContract(contract, expected.targetBaseSha);
  assertExactVerification(verification);
  const contractRevision = sha256(documents.get(CONTRACT_PATH)!.bytes);
  const verificationRevision = sha256(documents.get(VERIFICATION_PATH)!.bytes);
  const proofBundleDigest = sha256(documents.get(BUNDLE_PATH)!.bytes);
  if (
    bundle.contract_revision !== contractRevision ||
    bundle.verification_revision !== verificationRevision
  ) {
    throw new Error("Docs proof bundle revision digest drift");
  }
  await assertFileRecords(
    root,
    bundle.files,
    DOCS_PROOF_PAYLOAD_PATHS,
    "Docs proof bundle",
  );
  await assertFileRecords(
    root,
    provenance.files,
    [BUNDLE_PATH, ...DOCS_PROOF_PAYLOAD_PATHS].sort(),
    "Docs proof provenance",
  );
  if (
    provenance.bundle?.digest !== proofBundleDigest ||
    provenance.contract?.digest !== contractRevision ||
    provenance.verification?.digest !== verificationRevision
  ) {
    throw new Error("Docs proof provenance revision digest drift");
  }
  if (provenance.source?.repository !== "kaimihata/silicon-game") {
    throw new Error("Docs proof source repository is invalid");
  }
  if (
    provenance.source?.sha !== expected.sourceSha ||
    provenance.source?.ref !== expected.sourceRef
  ) {
    throw new Error("Docs proof source SHA/ref binding is stale or wrong");
  }
  if (
    provenance.target?.repository !== TARGET_REPOSITORY ||
    provenance.target?.ref !== TARGET_REF ||
    provenance.target?.base_sha !== expected.targetBaseSha
  ) {
    throw new Error("Docs proof target base semantics are stale or wrong");
  }
  if (
    bundle.execution_authority !== false ||
    bundle.human_review_required !== true ||
    provenance.execution_authority !== false ||
    provenance.human_review_required !== true
  ) {
    throw new Error("Docs proof authority flags are not exact");
  }
  return { proofBundleDigest, contractRevision, verificationRevision };
}

export async function exportDocsProofFromRepository(
  out: string,
  sourceSha: string,
  sourceRef: string,
  targetBaseSha: string,
  repositoryRoot: string,
  policy: RepositoryProofPolicy,
): Promise<DocsProofExportResult> {
  assertSha(targetBaseSha, "--target-base-sha");
  const verified = await verifyRepositorySource(
    sourceSha,
    sourceRef,
    repositoryRoot,
    policy,
  );
  return publishVerifiedProductionSpecExport(
    out,
    verified,
    () => verifyRepositorySource(sourceSha, sourceRef, repositoryRoot, policy),
    (temporary, source, snapshot) =>
      writeDocsProof(temporary, source, snapshot, targetBaseSha),
  );
}

export async function exportDocsProof(
  out: string,
  sourceSha: string,
  sourceRef: string,
  targetBaseSha: string,
): Promise<DocsProofExportResult> {
  assertSha(targetBaseSha, "--target-base-sha");
  const verified = await verifySourceRepository(sourceSha, sourceRef);
  return publishVerifiedProductionSpecExport(
    out,
    verified,
    () => verifySourceRepository(sourceSha, sourceRef),
    (temporary, source, snapshot) =>
      writeDocsProof(temporary, source, snapshot, targetBaseSha),
  );
}
