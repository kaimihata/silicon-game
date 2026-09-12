import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { canonicalJson } from "../src/canonical.js";
import {
  DOCS_PROOF_OUTPUT_PATHS,
  DOCS_PROOF_PAYLOAD_PATHS,
  exportDocsProofFromRepository,
  validateAuthoredDocsProof,
  validateDocsProofBundleDirectory,
} from "../src/docs-proof.js";
import { ROOT } from "../src/io.js";
import { createGitExportFixture, type GitExportFixture } from "./git-export-fixture.js";

const WORK = join(ROOT, "tests/.docs-proof-generated");
const BASE = join(WORK, "base");
const TARGET_BASE = "2385a00432159e9571ea93c43c97b588016bdb78";
const GAME_MANIFEST_SHA256 =
  "059aa5294ebf68b27ae0793dec1f46387513514fc51e489e7b458760645cb18a";
const GAME_GOLDEN_SHA256 =
  "20f96a971ae927f2588ce95739d077c998d41c1cdc8cc288195bf3b753f3e056";
const GAME_SPECIFICATION_REVISION =
  "sha256:ff3e261ae43017b2881cbaef7952ec1f4b4d5c749965a65a12722398e9213fcc";
let fixture: GitExportFixture;

function digest(bytes: Buffer | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function exportFixture(out: string): Promise<void> {
  await exportDocsProofFromRepository(
    out,
    fixture.head,
    fixture.sourceRef,
    TARGET_BASE,
    fixture.repository,
    {
      remoteName: "origin",
      remoteUrl: fixture.remote,
      sourceRepository: "kaimihata/silicon-game",
    },
  );
}

async function copyBase(name: string): Promise<string> {
  const destination = join(WORK, name);
  await cp(BASE, destination, { recursive: true });
  return destination;
}

async function readJson(root: string, path: string): Promise<any> {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function writeCanonical(root: string, path: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(canonicalJson(value));
  await writeFile(join(root, path), bytes);
  return bytes;
}

async function rebindPayload(
  root: string,
  path: "proof/contract.json" | "proof/verification.json",
  mutate: (value: any) => void,
): Promise<void> {
  const value = await readJson(root, path);
  mutate(value);
  const payloadBytes = await writeCanonical(root, path, value);
  const payloadDigest = digest(payloadBytes);
  const bundle = await readJson(root, "proof-bundle.json");
  const bundleFile = bundle.files.find((file: any) => file.path === path);
  bundleFile.bytes = payloadBytes.byteLength;
  bundleFile.sha256 = payloadDigest;
  if (path === "proof/contract.json") bundle.contract_revision = payloadDigest;
  else bundle.verification_revision = payloadDigest;
  const bundleBytes = await writeCanonical(root, "proof-bundle.json", bundle);
  const bundleDigest = digest(bundleBytes);
  const provenance = await readJson(root, "proof-provenance.json");
  const provenancePayload = provenance.files.find((file: any) => file.path === path);
  provenancePayload.bytes = payloadBytes.byteLength;
  provenancePayload.sha256 = payloadDigest;
  const provenanceBundle = provenance.files.find(
    (file: any) => file.path === "proof-bundle.json",
  );
  provenanceBundle.bytes = bundleBytes.byteLength;
  provenanceBundle.sha256 = bundleDigest;
  provenance.bundle.digest = bundleDigest;
  if (path === "proof/contract.json") provenance.contract.digest = payloadDigest;
  else provenance.verification.digest = payloadDigest;
  await writeCanonical(root, "proof-provenance.json", provenance);
}

function expected(root: string) {
  return validateDocsProofBundleDirectory(root, {
    sourceSha: fixture.head,
    sourceRef: fixture.sourceRef,
    targetBaseSha: TARGET_BASE,
  });
}

beforeAll(async () => {
  await rm(WORK, { recursive: true, force: true });
  fixture = await createGitExportFixture();
  await exportFixture(BASE);
});

afterAll(async () => {
  await rm(WORK, { recursive: true, force: true });
  await fixture?.remove();
});

describe("docs-live-proof-v1", () => {
  test("validates the isolated authored contract", async () => {
    await expect(validateAuthoredDocsProof(ROOT, TARGET_BASE)).resolves.toBeUndefined();
  });

  test("exports deterministic canonical closed-set bytes", async () => {
    const second = join(WORK, "second");
    await exportFixture(second);
    expect(await readdir(BASE)).toEqual(await readdir(second));
    expect((await readdir(BASE)).sort()).toEqual(["proof", "proof-bundle.json", "proof-provenance.json", "schemas"]);
    for (const path of DOCS_PROOF_OUTPUT_PATHS) {
      const firstBytes = await readFile(join(BASE, path));
      const secondBytes = await readFile(join(second, path));
      expect(firstBytes.equals(secondBytes), path).toBe(true);
      expect(firstBytes.equals(Buffer.from(canonicalJson(JSON.parse(firstBytes.toString("utf8"))))), path)
        .toBe(true);
      expect(firstBytes.at(-1), path).not.toBe(0x0a);
    }
    await expect(expected(BASE)).resolves.toMatchObject({
      proofBundleDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      contractRevision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      verificationRevision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  test("binds the exact source, target, one-path contract, and no authority", async () => {
    const bundle = await readJson(BASE, "proof-bundle.json");
    const contract = await readJson(BASE, "proof/contract.json");
    const provenance = await readJson(BASE, "proof-provenance.json");
    expect(bundle).toMatchObject({
      protocol_id: "docs-live-proof-v1",
      state: "ready",
      execution_authority: false,
      human_review_required: true,
    });
    expect(bundle.files.map((file: any) => file.path)).toEqual(DOCS_PROOF_PAYLOAD_PATHS);
    expect(contract.target).toEqual({
      repository: "kaimihata/silicon-game-v1",
      ref: "refs/heads/develop",
      base_sha: TARGET_BASE,
    });
    expect(contract.change_policy.max_changed_paths).toBe(1);
    expect(contract.change_policy.allowed_changes).toEqual([{
      path: "docs/live-proof.md",
      change_kind: "add",
      mode: "100644",
      blob_object_id: "74a349837fcb7e1f8d6fb8cdb015089c66edadce",
      content_sha256: "sha256:1c3cc393ba4b6269bfda95738934ec933990133120dfec373c9e0e1c17959e13",
      encoding: "UTF-8",
      final_newline: true,
    }]);
    expect(contract.authority).toEqual({
      execution_authority: false,
      merge_authority: false,
      dispatch_authority: false,
      deploy_authority: false,
      human_review_required: true,
    });
    expect(provenance.source).toEqual({
      repository: "kaimihata/silicon-game",
      ref: fixture.sourceRef,
      sha: fixture.head,
    });
    expect(provenance.target.base_sha).toBe(TARGET_BASE);
    expect(provenance).not.toHaveProperty("reviewer");
    expect(provenance).not.toHaveProperty("reviewed_at");
    expect(provenance).not.toHaveProperty("disposition");
  });

  test("keeps bundle review, candidate evidence review, packet approval, and promotion separate", async () => {
    const schemasRoot = join(BASE, "schemas");
    const bundleReviewSchema = JSON.parse(
      await readFile(join(schemasRoot, "docs-live-proof-review-disposition-v1.schema.json"), "utf8"),
    );
    const candidateReviewSchema = JSON.parse(
      await readFile(
        join(schemasRoot, "docs-live-proof-candidate-evidence-disposition-v1.schema.json"),
        "utf8",
      ),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateBundleReview = ajv.compile(bundleReviewSchema);
    const validateCandidateReview = ajv.compile(candidateReviewSchema);
    const common = {
      schema_version: 1,
      proof_bundle_digest: `sha256:${"1".repeat(64)}`,
      contract_revision: `sha256:${"2".repeat(64)}`,
      verification_revision: `sha256:${"3".repeat(64)}`,
      source: {
        repository: "kaimihata/silicon-game",
        ref: "refs/heads/reviewed",
        sha: "4".repeat(40),
      },
      target: {
        repository: "kaimihata/silicon-game-v1",
        ref: "refs/heads/develop",
        base_sha: TARGET_BASE,
      },
      reviewer: { provider: "github", immutable_user_id: 1, login: "reviewer" },
      reviewed_at: "2026-09-12T12:00:00Z",
      disposition: "accepted",
      execution_authority: false,
      merge_authority: false,
      dispatch_authority: false,
      deploy_authority: false,
    };
    const bundleReview = {
      ...common,
      artifact_type: "docs_live_proof_bundle_review_disposition_v1",
    };
    expect(validateBundleReview(bundleReview), JSON.stringify(validateBundleReview.errors)).toBe(true);
    expect(validateBundleReview({ ...bundleReview, candidate_head_sha: "5".repeat(40) })).toBe(false);

    const candidateReview = {
      ...common,
      artifact_type: "docs_live_proof_candidate_evidence_disposition_v1",
      candidate_head_sha: "5".repeat(40),
      evidence_bindings: [
        {
          obligation_id: "hosted_validate_as_data",
          evidence_digest: `sha256:${"6".repeat(64)}`,
        },
        {
          obligation_id: "candidate_git_tree_blob_content",
          evidence_digest: `sha256:${"7".repeat(64)}`,
        },
      ],
    };
    expect(
      validateCandidateReview(candidateReview),
      JSON.stringify(validateCandidateReview.errors),
    ).toBe(true);
    expect(validateCandidateReview({
      ...candidateReview,
      candidate_head_sha: undefined,
    })).toBe(false);
    expect(validateCandidateReview({
      ...candidateReview,
      evidence_bindings: candidateReview.evidence_bindings.slice(0, 1),
    })).toBe(false);
    expect(validateCandidateReview({
      ...candidateReview,
      evidence_bindings: [
        candidateReview.evidence_bindings[0],
        {
          ...candidateReview.evidence_bindings[0],
          evidence_digest: `sha256:${"8".repeat(64)}`,
        },
      ],
    })).toBe(false);
    expect(validateCandidateReview({ ...candidateReview, execution_authority: true })).toBe(false);
  });

  test("requires candidate heads in both typed machine evidence reports", async () => {
    const hostedSchema = await readJson(BASE, "schemas/hosted-validate-as-data-v1.schema.json");
    const treeSchema = await readJson(
      BASE,
      "schemas/candidate-git-tree-blob-content-v1.schema.json",
    );
    expect(hostedSchema.required).toContain("candidate_head_sha");
    expect(treeSchema.required).toContain("candidate_head_sha");
    expect(hostedSchema.properties.job.const).toBe("validate-as-data");
    expect(hostedSchema.properties.workflow_id.const).toBe(349570522);
    expect(hostedSchema.properties.workflow_path.const)
      .toBe(".github/workflows/runner-contract-validation.yml");
    expect(hostedSchema.properties.workflow_blob_sha.const)
      .toBe("0f66a20943fb86f3cd1bd821aa490fa9716ef0af");
    expect(hostedSchema.required).toContain("trusted_log_attestation_digest");
    const rawFacts = hostedSchema.properties.raw_facts;
    expect(rawFacts.properties.workflow_sha_source.const)
      .toBe("authenticated_trusted_log_attestation");
    expect(rawFacts.properties.pr_ref.pattern).toBe("^refs/pull/[1-9][0-9]*/head$");
    expect(rawFacts.properties.base_ref.const).toBe("develop");
    expect(rawFacts.properties.workflow_sha_matches_trusted_controller.const).toBe(true);
    expect(rawFacts.properties.trusted_controller_distinct_from_candidate.const).toBe(true);
    expect(rawFacts.properties.fetch_head_matches_candidate.const).toBe(true);
    expect(rawFacts.properties.validator_command.const)
      .toBe("python3 scripts/static_candidate_validator.py --trusted-sha \"$TRUSTED_CONTROLLER_SHA\" --candidate-sha \"$CANDIDATE_SHA\"");
    expect(rawFacts.properties.validated_without_candidate_execution.const).toBe(true);
    expect(hostedSchema.properties.check_name.const).toBe("validate-as-data");
    expect(hostedSchema.properties.event.const).toBe("pull_request_target");
    expect(hostedSchema.properties.app_id.const).toBe(15368);
    expect(hostedSchema.properties.app_slug.const).toBe("github-actions");
    expect(treeSchema.properties.path.const).toBe("docs/live-proof.md");
  });

  test.each([
    ["path", (contract: any) => { contract.change_policy.allowed_changes[0].path = "docs/other.md"; }],
    ["change kind", (contract: any) => { contract.change_policy.allowed_changes[0].change_kind = "modify"; }],
    ["mode", (contract: any) => { contract.change_policy.allowed_changes[0].mode = "100755"; }],
    ["content hash", (contract: any) => { contract.change_policy.allowed_changes[0].content_sha256 = `sha256:${"0".repeat(64)}`; }],
    ["second path", (contract: any) => { contract.change_policy.allowed_changes.push({ ...contract.change_policy.allowed_changes[0], path: "README.md" }); }],
  ])("rejects wrong sole-change %s even with rebound outer digests", async (_label, mutate) => {
    const root = await copyBase(`contract-${_label.replaceAll(" ", "-")}`);
    await rebindPayload(root, "proof/contract.json", mutate);
    await expect(expected(root)).rejects.toThrow(/invalid|sole allowed change|exactly one/);
  });

  test("rejects missing evidence, mutable identity, and same producer/evaluator", async () => {
    const missing = await copyBase("missing-obligation");
    await rebindPayload(
      missing,
      "proof/verification.json",
      (verification) => verification.evidence_obligations.pop(),
    );
    await expect(expected(missing)).rejects.toThrow(/invalid|exactly two/);

    const same = await copyBase("same-evaluator");
    await rebindPayload(same, "proof/verification.json", (verification) => {
      verification.evidence_obligations[0].evaluator.role_id = "trusted_system_collector";
    });
    await expect(expected(same)).rejects.toThrow(/not independent/);

    const mutable = await copyBase("mutable-evidence");
    await rebindPayload(mutable, "proof/verification.json", (verification) => {
      verification.evidence_obligations[0].immutable_identity_fields.pop();
    });
    await expect(expected(mutable)).rejects.toThrow(/not exact|mutable|invalid/);
  });

  test("rejects any authority escalation even with rebound outer digests", async () => {
    const contractRoot = await copyBase("contract-authority");
    await rebindPayload(contractRoot, "proof/contract.json", (contract) => {
      contract.authority.execution_authority = true;
    });
    await expect(expected(contractRoot)).rejects.toThrow(/invalid|authority flags/);

    const bundleRoot = await copyBase("bundle-authority");
    const bundle = await readJson(bundleRoot, "proof-bundle.json");
    bundle.execution_authority = true;
    const bundleBytes = await writeCanonical(bundleRoot, "proof-bundle.json", bundle);
    const provenance = await readJson(bundleRoot, "proof-provenance.json");
    const record = provenance.files.find((file: any) => file.path === "proof-bundle.json");
    record.bytes = bundleBytes.byteLength;
    record.sha256 = digest(bundleBytes);
    provenance.bundle.digest = digest(bundleBytes);
    await writeCanonical(bundleRoot, "proof-provenance.json", provenance);
    await expect(expected(bundleRoot)).rejects.toThrow(/invalid|authority flags/);
  });

  test("rejects wrong source and stale target bindings", async () => {
    await expect(validateDocsProofBundleDirectory(BASE, {
      sourceSha: "a".repeat(40),
      sourceRef: fixture.sourceRef,
      targetBaseSha: TARGET_BASE,
    })).rejects.toThrow("source SHA/ref");
    await expect(validateDocsProofBundleDirectory(BASE, {
      sourceSha: fixture.head,
      sourceRef: "refs/heads/wrong",
      targetBaseSha: TARGET_BASE,
    })).rejects.toThrow("source SHA/ref");
    await expect(validateDocsProofBundleDirectory(BASE, {
      sourceSha: fixture.head,
      sourceRef: fixture.sourceRef,
      targetBaseSha: "a".repeat(40),
    })).rejects.toThrow(/target repository\/ref\/base SHA|target base semantics/);
  });

  test("rejects missing, extra, noncanonical, symlinked, and digest-drift output", async () => {
    const missing = await copyBase("missing-file");
    await rm(join(missing, "proof/verification.json"));
    await expect(expected(missing)).rejects.toThrow("file set");

    const extra = await copyBase("extra-file");
    await writeFile(join(extra, "accepted-review.json"), "{}");
    await expect(expected(extra)).rejects.toThrow("file set");

    const noncanonical = await copyBase("noncanonical");
    const bundle = await readJson(noncanonical, "proof-bundle.json");
    await writeFile(join(noncanonical, "proof-bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
    await expect(expected(noncanonical)).rejects.toThrow("not exact RFC 8785");

    const drift = await copyBase("digest-drift");
    await writeFile(join(drift, "proof/contract.json"), "{}");
    await expect(expected(drift)).rejects.toThrow(/invalid|digest\/byte drift|revision digest drift/);

    const symlinked = await copyBase("symlinked");
    await rm(join(symlinked, "proof/contract.json"));
    await symlink("../proof-bundle.json", join(symlinked, "proof/contract.json"));
    await expect(expected(symlinked)).rejects.toThrow("forbidden symlink");
  });

  test("rejects stale destinations and source dirtiness without publishing", async () => {
    const stale = join(WORK, "stale");
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, "old-authority.json"), "{}");
    await expect(exportFixture(stale)).rejects.toThrow("stale authority files");
    expect(await readFile(join(stale, "old-authority.json"), "utf8")).toBe("{}");

    await writeFile(join(fixture.specificationRoot, "docs-proof-dirty.txt"), "dirty\n");
    await expect(exportFixture(join(WORK, "dirty-source"))).rejects.toThrow("not clean");
    await rm(join(fixture.specificationRoot, "docs-proof-dirty.txt"));
  });

  test("cleans temporary output when the source races before publication", async () => {
    const out = join(WORK, "source-race");
    const exporting = exportFixture(out).then(
      () => ({ ok: true as const, error: undefined }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const prefix = ".source-race.tmp-";
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if ((await readdir(WORK)).some((entry) => entry.startsWith(prefix))) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 1));
    }
    const readme = join(fixture.specificationRoot, "README.md");
    await writeFile(readme, `${await readFile(readme, "utf8")}\nraced\n`);
    const result = await exporting;
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    await expect(readdir(out)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(WORK)).some((entry) => entry.startsWith(prefix))).toBe(false);
    await fixture.git("checkout", "--", "production-spec/README.md");
  });

  test("preserves authoritative game manifest, golden bytes, and specification revision", async () => {
    const manifest = await readFile(join(ROOT, "bundle.yaml"));
    const golden = await readFile(join(ROOT, "fixtures/generated/game-spec-bundle-v1.json"));
    const gameBundle = JSON.parse(golden.toString("utf8"));
    expect(digest(manifest)).toBe(`sha256:${GAME_MANIFEST_SHA256}`);
    expect(digest(golden)).toBe(`sha256:${GAME_GOLDEN_SHA256}`);
    expect(gameBundle.specification_revision).toBe(GAME_SPECIFICATION_REVISION);
  });
});
