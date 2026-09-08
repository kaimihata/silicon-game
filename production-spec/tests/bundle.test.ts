import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { canonicalJson, digest } from "../src/canonical.js";
import {
  compileDesignRecipes,
  deriveReferenceBalance,
  manufacturingPlanDigest,
  validateManufacturingPlan,
} from "../src/derive.js";
import {
  compileContent,
  exportBundleFromRepository,
  verifyRepositorySource,
} from "../src/export.js";
import { ROOT } from "../src/io.js";
import { generatePacket, validatePacket } from "../src/packet.js";
import { assertReadyForExport, validateBundle, validateCatalogReferences } from "../src/validate.js";
import { readYaml } from "../src/io.js";
import { createGitExportFixture } from "./git-export-fixture.js";

const WORK = join(ROOT, "tests/.generated");
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await rm(WORK, { recursive: true, force: true });
});

describe("bundle", () => {
  test("validates all authored data and references", async () => {
    const result = await validateBundle();
    expect(result.issues).toEqual([]);
    expect(result.bundleDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("reports broken catalog cross-references", async () => {
    const catalog = structuredClone(await readYaml<any>(join(ROOT, "content/catalog.yaml")));
    catalog.offers[0].specification_id = "missing-part";
    const issues: { path: string; message: string }[] = [];
    validateCatalogReferences(catalog, issues);
    expect(issues.some((issue) => issue.message.includes("missing-part"))).toBe(true);
  });

  test("rejects artifact schemas outside the canonical schemas tree", async () => {
    const fixture = await createGitExportFixture();
    const bundlePath = join(fixture.specificationRoot, "bundle.yaml");
    const bundle = await readFile(bundlePath, "utf8");
    await writeFile(
      bundlePath,
      bundle.replace(
        "schema: schemas/specification.schema.json",
        "schema: schemas/../../outside.schema.json",
      ),
    );
    await writeFile(
      join(fixture.repository, "outside.schema.json"),
      JSON.stringify({}),
    );

    const result = await validateBundle(fixture.specificationRoot);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "specifications/context.yaml",
        message: expect.stringContaining("beneath schemas/"),
      }),
    ]));
    await fixture.remove();
  });

  test("canonical digest is independent of object key order", () => {
    const first = { z: [3, 2, 1], a: { y: true, x: "chip" } };
    const second = { a: { x: "chip", y: true }, z: [3, 2, 1] };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(digest(first)).toBe(digest(second));
  });

  test("validates every closed player command and response fixture", async () => {
    const schema = JSON.parse(await readFile(join(ROOT, "schemas/protocol-wire.schema.json"), "utf8"));
    const fixture = await readYaml<any>(join(ROOT, "fixtures/reference/player-protocol-v1-contract.yaml"));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    const actions = new Set<string>();
    for (const entry of fixture.request_cases) {
      const request = { ...fixture.request_defaults, ...entry };
      expect(validate(request), JSON.stringify(validate.errors)).toBe(true);
      actions.add(entry.action);
    }
    expect(actions.size).toBe(36);
    for (const response of fixture.responses) {
      expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    }
    const invalid = {
      ...fixture.request_defaults,
      command_id: "cmd-invalid",
      action: "set_speed",
      arguments: { speed: 1, hidden_override: true },
    };
    expect(validate(invalid)).toBe(false);
  });

  test("keeps review, packet approval, and promotion authority separate", async () => {
    const packet = await generatePacket("a".repeat(40));
    const reviewSchema = JSON.parse(
      await readFile(join(ROOT, "schemas/bundle-review-disposition.schema.json"), "utf8"),
    );
    const review = {
      schema_version: 1,
      artifact_type: "bundle_review_disposition",
      source_repository: "kaimihata/silicon-game",
      source_revision: "b".repeat(40),
      bundle_digest: `sha256:${"c".repeat(64)}`,
      specification_revision: packet.source.specification_revision,
      reviewer: { provider: "github", immutable_user_id: 1, login: "reviewer" },
      reviewed_at: "2026-01-01T00:00:00Z",
      disposition: "accepted",
      execution_authority: false,
    };
    const reviewAjv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(reviewAjv);
    const validateReview = reviewAjv.compile(reviewSchema);
    expect(validateReview(review)).toBe(true);
    expect(validateReview({ ...review, execution_authority: true })).toBe(false);

    const promotionSchema = JSON.parse(
      await readFile(join(ROOT, "schemas/promotion-request.schema.json"), "utf8"),
    );
    const promotion = {
      schema_version: 1,
      artifact_type: "promotion_request",
      request_id: "promotion-1",
      target_repository: "kaimihata/silicon-game-v1",
      source_branch: "develop",
      source_revision: "d".repeat(40),
      target_branch: "main",
      checkpoint_digest: `sha256:${"1".repeat(64)}`,
      packet_digest: `sha256:${"2".repeat(64)}`,
      packet_approval_digest: `sha256:${"3".repeat(64)}`,
      specification_revision: packet.source.specification_revision,
      policy_revision: packet.source.policy_revision,
      evidence_manifest_digest: `sha256:${"4".repeat(64)}`,
      requested_tag: "v0.1.0",
      factory_authority: "request_only",
    };
    const validatePromotion = new Ajv2020({ allErrors: true, strict: false }).compile(promotionSchema);
    expect(validatePromotion(promotion)).toBe(true);
    expect(validatePromotion({ ...promotion, factory_authority: "merge_and_tag" })).toBe(false);
  });

  test("compiles runtime content to canonical JSON", async () => {
    await compileContent(WORK);
    const source = await readYaml(join(ROOT, "content/catalog.yaml"));
    const compiled = await readFile(join(WORK, "runtime/catalog.json"), "utf8");
    expect(compiled).toBe(`${canonicalJson(source)}\n`);
    const provenance = JSON.parse(await readFile(join(WORK, "runtime/catalog.provenance.json"), "utf8"));
    expect(provenance.content_digest).toBe(digest(source));
  });

  test("generates a packet valid against pinned Direction Packet v1", async () => {
    const base = "a".repeat(40);
    const packet = await generatePacket(base);
    expect(packet.source.base_revision).toBe(base);
    expect(packet.source.specification_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(packet.source.policy_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(packet.requirements.every((requirement: any) => /^\/rules\/\d+$/.test(requirement.source.fragment))).toBe(true);
    expect(packet.scope.included.every((entry: any) => entry.statement.includes("Authority is limited to exact rule"))).toBe(true);
    expect(packet.scope.included.every((entry: any) =>
      entry.specifications.every((specification: any) =>
        /^\/rules\/\d+$/.test(specification.fragment)
      )
    )).toBe(true);
    expect(packet.requirements.some((requirement: any) =>
      requirement.id.startsWith("req.transition.")
    )).toBe(false);
    expect(packet.constraints.performance[0]).toMatchObject({
      operator: "less_than_or_equal",
      value: 16.67,
      unit: "milliseconds",
    });
    expect(packet.authority_policy.protected_paths).not.toContain("ProjectSettings/**");
    expect(packet.authority_policy.protected_paths).not.toContain("Packages/**");
    expect(packet.scope.assumptions.find((assumption: any) =>
      assumption.id === "assumption-factory-preflight"
    )?.statement).toContain("observed develop head");
    expect(packet.scope.assumptions.find((assumption: any) =>
      assumption.id === "assumption-factory-preflight"
    )?.statement).not.toContain("protected develop");
    await expect(validatePacket(packet)).resolves.toBeUndefined();
  });

  test("models compensating controls for the unprotected private target", async () => {
    const bootstrap = await readYaml<any>(join(ROOT, "target-bootstrap/manifest.yaml"));
    expect(bootstrap.observed_integration).toEqual({
      repository_state: "existing_private_unity_project",
      integration_branch: "develop",
      observed_head: "19137ee04ddd5020c3e7520b33a3b819ea4b4348",
      runner_contracts: "landed",
      authority: "informational_snapshot_requires_fresh_preflight_observation",
    });
    expect(bootstrap.branch_controls).toEqual({
      integration_branch: "develop",
      branch_protection: "unavailable_on_current_plan",
      push_access: "owner_and_selected_service_identities_only",
      workflow_checks: "required_for_exact_head_before_factory_authority",
      base_sha_pinning: "direction_packet_base_revision_is_exact_40_hex_develop_head",
      digest_approval: "immutable_specification_and_packet_digests_require_separate_human_approval",
      human_promotion: "only_human_may_merge_bound_develop_revision_and_create_tag",
      unexpected_movement: "invalidate_authority_and_revalidate_from_new_exact_head",
      residual_risk: "selected_push_access_can_bypass_workflow_checks_by_direct_push",
    });
    const policy = await readYaml<any>(join(ROOT, "policy/first-run.yaml"));
    expect(policy.branch_policy.join("\n")).toContain("no true branch protection");
    expect(policy.branch_policy.join("\n")).toContain("accepted residual risk");
    expect(policy.checkpoint_lifecycle.stale_rejection).toContain("unexpectedly moved develop head");
  });

  test("exports target paths and binds each exported file to a byte digest", async () => {
    const out = join(WORK, "export");
    const fixture = await createGitExportFixture();
    await exportBundleFromRepository(
      out,
      fixture.head,
      fixture.sourceRef,
      fixture.repository,
      {
        remoteName: "origin",
        remoteUrl: fixture.remote,
        sourceRepository: "fixture/chip-city",
      },
    );
    const provenance = JSON.parse(await readFile(join(out, "specification-provenance.json"), "utf8"));
    const artifacts = provenance.exported_artifacts as {
      source_path: string;
      target_path: string;
      content_digest: string;
    }[];
    expect(artifacts.length).toBeGreaterThan(40);
    expect(artifacts.every((artifact) => /^sha256:[0-9a-f]{64}$/.test(artifact.content_digest))).toBe(true);
    expect(artifacts.some((artifact) => artifact.target_path === "code-factory/registries/suites.yaml")).toBe(true);
    expect(artifacts.some((artifact) => artifact.target_path === "code-factory/registries/checks.yaml")).toBe(true);
    expect(artifacts.some((artifact) => artifact.target_path === "specifications/traceability/requirement-fragments.json")).toBe(true);
    expect(artifacts.some((artifact) => artifact.target_path === "target-bootstrap/manifest.yaml")).toBe(true);
    expect(artifacts.some((artifact) => artifact.target_path === "LICENSE")).toBe(true);
    expect(provenance.status).toBe("ready");
    expect(provenance.authority_state).toBe("author_complete_not_executable");
    expect(provenance.source_revision).toBe(fixture.head);
    const exportedPaths = await readdir(out);
    expect(exportedPaths).toContain("README.specification-import.md");
    expect(exportedPaths).not.toContain("README-specification-import.md");
    expect(artifacts.filter((artifact) =>
      artifact.target_path === "README.specification-import.md"
    )).toHaveLength(1);
    const packetConfig = await readYaml<any>(
      join(out, "code-factory/direction-packets/templates/chip-city-foundation-01.config.yaml")
    );
    expect(packetConfig.requirement_catalogs).toEqual([
      "specifications/requirements/foundation.yaml",
      "specifications/requirements/vertical-slice.yaml",
    ]);
    expect(packetConfig.policy).toBe("code-factory/policy/first-run.yaml");
    await fixture.remove();
  });

  test("rejects stale or symlink destinations instead of retaining authority files", async () => {
    const fixture = await createGitExportFixture();
    const stale = join(WORK, "stale-export");
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, "old-approval.json"), "{}");
    await expect(fixture.exportBundle(stale)).rejects.toMatchObject({
      stderr: expect.stringContaining("stale authority files"),
    });
    expect(await readFile(join(stale, "old-approval.json"), "utf8")).toBe("{}");

    const real = join(WORK, "real-export");
    const linked = join(WORK, "linked-export");
    await mkdir(real, { recursive: true });
    await symlink(real, linked, "dir");
    await expect(fixture.exportBundle(linked)).rejects.toMatchObject({
      stderr: expect.stringContaining("must not be a symlink"),
    });
    await fixture.remove();
  });

  test("cleans its temporary sibling when atomic publication fails", async () => {
    const fixture = await createGitExportFixture();
    const out = join(WORK, "raced-export");
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    const exporting = fixture.exportBundle(out).then(
      () => ({ ok: true as const, error: undefined }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const temporaryPrefix = ".raced-export.tmp-";
    let sawTemporary = false;
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if ((await readdir(WORK)).some((entry) => entry.startsWith(temporaryPrefix))) {
        sawTemporary = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 1));
    }
    expect(sawTemporary).toBe(true);
    await writeFile(join(out, "stale-authority.json"), "{}");
    const result = await exporting;
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      stderr: expect.stringContaining("stale authority files"),
    });
    expect((await readdir(WORK)).some((entry) => entry.startsWith(temporaryPrefix))).toBe(false);
    await fixture.remove();
  });

  test("rejects a source repository mutation before atomic publication", async () => {
    const fixture = await createGitExportFixture();
    const out = join(WORK, "source-raced-export");
    await rm(out, { recursive: true, force: true });
    await mkdir(WORK, { recursive: true });
    const exporting = fixture.exportBundle(out).then(
      () => ({ ok: true as const, error: undefined }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const temporaryPrefix = ".source-raced-export.tmp-";
    let sawTemporary = false;
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if ((await readdir(WORK)).some((entry) => entry.startsWith(temporaryPrefix))) {
        sawTemporary = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 1));
    }
    expect(sawTemporary).toBe(true);
    const readme = join(fixture.specificationRoot, "README.md");
    await writeFile(readme, `${await readFile(readme, "utf8")}\nconcurrent mutation\n`);
    const result = await exporting;
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      stderr: expect.stringContaining("source repository is not clean"),
    });
    await expect(readdir(out)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(WORK)).some((entry) => entry.startsWith(temporaryPrefix))).toBe(false);
    await fixture.remove();
  });

  test("exports from the verified snapshot when a live source file changes and is restored", async () => {
    const fixture = await createGitExportFixture();
    const out = join(WORK, "snapshot-export");
    await rm(out, { recursive: true, force: true });
    await mkdir(WORK, { recursive: true });
    const exporting = fixture.exportBundle(out).then(
      () => ({ ok: true as const, error: undefined }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const temporaryPrefix = ".snapshot-export.tmp-";
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if ((await readdir(WORK)).some((entry) => entry.startsWith(temporaryPrefix))) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 1));
    }
    const source = join(fixture.specificationRoot, "handoff/target-import.md");
    const original = await readFile(source, "utf8");
    await writeFile(source, `${original}\nuncommitted transient content\n`);
    await writeFile(source, original);
    const result = await exporting;
    expect(result).toEqual({ ok: true, error: undefined });
    expect(await readFile(join(out, "README.specification-import.md"), "utf8")).toBe(original);
    await fixture.remove();
  });

  test("materializes source blobs without repository checkout hooks or filters", async () => {
    const fixture = await createGitExportFixture();
    const out = join(WORK, "plumbing-export");
    const checkoutMarker = join(WORK, "post-checkout-ran");
    const fsmonitorMarker = join(WORK, "fsmonitor-ran");
    const hook = join(fixture.repository, ".git/hooks/post-checkout");
    const fsmonitor = join(fixture.repository, ".git/hooks/hostile-fsmonitor");
    const attributes = join(fixture.repository, ".git/attack-attributes");
    await mkdir(WORK, { recursive: true });
    await writeFile(hook, `#!/bin/sh\nprintf executed > "${checkoutMarker}"\n`);
    await chmod(hook, 0o755);
    await writeFile(fsmonitor, `#!/bin/sh\nprintf executed > "${fsmonitorMarker}"\n`);
    await chmod(fsmonitor, 0o755);
    await writeFile(
      attributes,
      "production-spec/handoff/target-import.md filter=attack\n",
    );
    await fixture.git("config", "core.attributesFile", attributes);
    await fixture.git("config", "core.fsmonitor", fsmonitor);
    await fixture.git("config", "filter.attack.smudge", "printf 'tampered\\n'");
    const original = await readFile(
      join(fixture.specificationRoot, "handoff/target-import.md"),
      "utf8",
    );

    await exportBundleFromRepository(
      out,
      fixture.head,
      fixture.sourceRef,
      fixture.repository,
      {
        remoteName: "origin",
        remoteUrl: fixture.remote,
        sourceRepository: "fixture/chip-city",
      },
    );

    await expect(readFile(checkoutMarker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(fsmonitorMarker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(out, "README.specification-import.md"), "utf8"))
      .toBe(original);
    await fixture.remove();
  });

  test("rejects a poisoned local object database even for an advertised commit", async () => {
    const fixture = await createGitExportFixture();
    const blobSha = await fixture.git(
      "rev-parse",
      `${fixture.head}:production-spec/handoff/target-import.md`,
    );
    const poisoned = Buffer.from("poisoned authored bytes\n");
    const objectPath = join(
      fixture.repository,
      ".git/objects",
      blobSha.slice(0, 2),
      blobSha.slice(2),
    );
    await mkdir(join(fixture.repository, ".git/objects", blobSha.slice(0, 2)), {
      recursive: true,
    });
    await writeFile(
      objectPath,
      deflateSync(Buffer.concat([
        Buffer.from(`blob ${poisoned.byteLength}\0`),
        poisoned,
      ])),
    );

    await expect(
      exportBundleFromRepository(
        join(WORK, "poisoned-object-export"),
        fixture.head,
        fixture.sourceRef,
        fixture.repository,
        {
          remoteName: "origin",
          remoteUrl: fixture.remote,
          sourceRepository: "fixture/chip-city",
        },
      ),
    ).rejects.toThrow(/object mismatch|bad object|hash mismatch/i);
    await fixture.remove();
  });

  test("requires an explicit full target base SHA", async () => {
    await expect(generatePacket("main")).rejects.toThrow("--base-sha");
  });

  test("draft bundles cannot export or generate packet authority", () => {
    expect(() => assertReadyForExport({ status: "draft", artifacts: [] }))
      .toThrow("Only a ready author-complete bundle");
  });

  test("proves source revisions against one advertised authoritative branch", async () => {
    const fixture = await createGitExportFixture();
    const policy = {
      remoteName: "origin",
      remoteUrl: fixture.remote,
      sourceRepository: "fixture/chip-city",
    };
    await expect(
      verifyRepositorySource(fixture.head, fixture.sourceRef, fixture.repository, policy),
    ).resolves.toMatchObject({ sourceSha: fixture.head });
    await expect(
      verifyRepositorySource("a".repeat(40), fixture.sourceRef, fixture.repository, policy),
    ).rejects.toThrow("does not match checked-out HEAD");

    await writeFile(join(fixture.specificationRoot, "authority.yaml"), "status: changed\n");
    await expect(
      verifyRepositorySource(fixture.head, fixture.sourceRef, fixture.repository, policy),
    ).rejects.toThrow("not clean");
    await rm(join(fixture.specificationRoot, "authority.yaml"));

    await fixture.git("remote", "set-url", "origin", "https://github.com/example/spoof.git");
    await expect(
      verifyRepositorySource(fixture.head, fixture.sourceRef, fixture.repository, policy),
    ).rejects.toThrow("single authoritative");
    await fixture.remove();
  });

  test("accepts valid Git branch ref characters for reviewed source refs", async () => {
    const fixture = await createGitExportFixture();
    const policy = {
      remoteName: "origin",
      remoteUrl: fixture.remote,
      sourceRepository: "fixture/chip-city",
    };
    for (const sourceRef of [
      "refs/heads/feature+proof",
      "refs/heads/review@v2",
      "refs/heads/release,proof",
    ]) {
      await execFileAsync(
        "git",
        ["--git-dir", fixture.remote, "update-ref", sourceRef, fixture.head],
      );
      await expect(
        verifyRepositorySource(fixture.head, sourceRef, fixture.repository, policy),
      ).resolves.toMatchObject({ sourceSha: fixture.head });
    }
    await fixture.remove();
  });

  test("rejects unadvertised commits, wrong refs, shallow clones, and missing proof", async () => {
    const fixture = await createGitExportFixture();
    const policy = {
      remoteName: "origin",
      remoteUrl: fixture.remote,
      sourceRepository: "fixture/chip-city",
    };
    await fixture.git("config", "user.name", "Production Spec Test");
    await fixture.git("config", "user.email", "production-spec@example.invalid");
    await writeFile(join(fixture.specificationRoot, "local-only.txt"), "unadvertised\n");
    await fixture.git("add", "production-spec/local-only.txt");
    await fixture.git("commit", "--quiet", "-m", "unadvertised local commit");
    const localHead = await fixture.git("rev-parse", "HEAD");
    await expect(
      verifyRepositorySource(localHead, fixture.sourceRef, fixture.repository, policy),
    ).rejects.toThrow("not the advertised tip");
    await expect(
      verifyRepositorySource(localHead, "refs/pull/2/head", fixture.repository, policy),
    ).rejects.toThrow("refs/heads");
    await expect(
      verifyRepositorySource(localHead, "refs/remotes/fork/topic", fixture.repository, policy),
    ).rejects.toThrow("refs/heads");

    await fixture.git("remote", "set-url", "origin", join(fixture.remote, "missing"));
    await expect(
      verifyRepositorySource(localHead, fixture.sourceRef, fixture.repository, {
        ...policy,
        remoteUrl: join(fixture.remote, "missing"),
      }),
    ).rejects.toThrow("remote proof is unavailable");
    await fixture.remove();

    const shallowContainer = join(WORK, "shallow");
    const shallowRepository = join(shallowContainer, "repository");
    await mkdir(shallowContainer, { recursive: true });
    const complete = await createGitExportFixture();
    await execFileAsync("git", [
      "clone",
      "--quiet",
      "--depth",
      "1",
      `file://${complete.remote}`,
      shallowRepository,
    ]);
    const shallowHead = (await execFileAsync(
      "git",
      ["-C", shallowRepository, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    )).stdout.trim();
    await expect(
      verifyRepositorySource(shallowHead, complete.sourceRef, shallowRepository, {
        remoteName: "origin",
        remoteUrl: `file://${complete.remote}`,
        sourceRepository: "fixture/chip-city",
      }),
    ).rejects.toThrow("non-shallow");
    await complete.remove();
  });

  test("ignores ambient Git configuration that attempts to redirect remote proof", async () => {
    const fixture = await createGitExportFixture();
    const original = {
      count: process.env.GIT_CONFIG_COUNT,
      key: process.env.GIT_CONFIG_KEY_0,
      value: process.env.GIT_CONFIG_VALUE_0,
      gitDir: process.env.GIT_DIR,
      gitWorkTree: process.env.GIT_WORK_TREE,
      sslNoVerify: process.env.GIT_SSL_NO_VERIFY,
    };
    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = `url.${join(fixture.remote, "attacker")}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_0 = fixture.remote;
    process.env.GIT_DIR = join(fixture.repository, ".git", "missing");
    process.env.GIT_WORK_TREE = join(fixture.repository, "missing");
    process.env.GIT_SSL_NO_VERIFY = "1";
    try {
      await expect(
        verifyRepositorySource(fixture.head, fixture.sourceRef, fixture.repository, {
          remoteName: "origin",
          remoteUrl: fixture.remote,
          sourceRepository: "fixture/chip-city",
        }),
      ).resolves.toMatchObject({ sourceSha: fixture.head });
    } finally {
      for (const [key, value] of [
        ["GIT_CONFIG_COUNT", original.count],
        ["GIT_CONFIG_KEY_0", original.key],
        ["GIT_CONFIG_VALUE_0", original.value],
        ["GIT_DIR", original.gitDir],
        ["GIT_WORK_TREE", original.gitWorkTree],
        ["GIT_SSL_NO_VERIFY", original.sslNoVerify],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await fixture.remove();
    }
  });

  test("does not discover repository-local redirects through an ambient temporary directory", async () => {
    const fixture = await createGitExportFixture();
    const ambientRepository = join(WORK, "ambient-repository");
    const attackerRemote = join(WORK, "attacker.git");
    await mkdir(WORK, { recursive: true });
    await execFileAsync("git", ["clone", "--quiet", "--bare", fixture.remote, attackerRemote]);
    await execFileAsync(
      "git",
      ["--git-dir", fixture.remote, "update-ref", "-d", fixture.sourceRef],
    );
    await execFileAsync("git", ["init", "--quiet", ambientRepository]);
    await execFileAsync(
      "git",
      [
        "-C",
        ambientRepository,
        "config",
        `url.${attackerRemote}.insteadOf`,
        fixture.remote,
      ],
    );
    const originalTmpdir = process.env.TMPDIR;
    process.env.TMPDIR = ambientRepository;
    try {
      await expect(
        verifyRepositorySource(fixture.head, fixture.sourceRef, fixture.repository, {
          remoteName: "origin",
          remoteUrl: fixture.remote,
          sourceRepository: "fixture/chip-city",
        }),
      ).rejects.toThrow("remote proof is unavailable");
    } finally {
      if (originalTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = originalTmpdir;
      await fixture.remove();
    }
  });

  test("CLI export has no arbitrary source-SHA bypass", async () => {
    const cli = join(ROOT, "node_modules/.bin/tsx");
    await expect(execFileAsync(cli, [
      "src/cli.ts",
      "export",
      "--out",
      join(WORK, "cli-export"),
      "--source-sha",
      "a".repeat(40),
      "--source-ref",
      "refs/heads/kaimihata-production-spec-authority",
    ], { cwd: ROOT, encoding: "utf8" })).rejects.toMatchObject({
      stderr: expect.stringContaining("does not match checked-out HEAD"),
    });
  });

  test("derives every golden balance field from catalog and reference fixtures", async () => {
    const catalog = await readYaml<any>(join(ROOT, "content/catalog.yaml"));
    const design = await readYaml<any>(join(ROOT, "fixtures/reference/default-qualifying-design.yaml"));
    const plan = await readYaml<any>(join(ROOT, "fixtures/reference/default-manufacturing-plan.yaml"));
    const factory = await readYaml<any>(join(ROOT, "fixtures/reference/complete-reference-factory.yaml"));
    const compiled = await readYaml<any>(join(ROOT, "fixtures/reference/default-compiled-recipes.yaml"));
    const derived = deriveReferenceBalance(catalog, design, plan, factory);
    for (const field of Object.keys(catalog.balance)) {
      expect(derived[field as keyof typeof derived]).toBeCloseTo(catalog.balance[field], field.includes("yield") ? 4 : 2);
    }
    expect(compileDesignRecipes(catalog, design, plan)).toEqual(compiled.recipes);
  });

  test("supplier, recipe, and machine changes alter derived balance", async () => {
    const catalog = await readYaml<any>(join(ROOT, "content/catalog.yaml"));
    const design = await readYaml<any>(join(ROOT, "fixtures/reference/default-qualifying-design.yaml"));
    const plan = await readYaml<any>(join(ROOT, "fixtures/reference/default-manufacturing-plan.yaml"));
    const factory = await readYaml<any>(join(ROOT, "fixtures/reference/complete-reference-factory.yaml"));
    const baseline = deriveReferenceBalance(catalog, design, plan, factory);

    const supplierChange = structuredClone(catalog);
    supplierChange.offers.find((offer: any) => offer.id === "primememory-md-110-premium").unit_price_usd += 1;
    expect(() => deriveReferenceBalance(supplierChange, design, plan, factory))
      .toThrow("source offer catalog is stale");

    const recipeChange = structuredClone(catalog);
    recipeChange.recipe_templates.find((recipe: any) => recipe.stage === "test").operating_cost_usd += 1;
    expect(deriveReferenceBalance(recipeChange, design, plan, factory).operating_cost_per_attempt_usd)
      .toBeGreaterThan(baseline.operating_cost_per_attempt_usd);

    const machineChange = structuredClone(catalog);
    machineChange.machines.find((machine: any) => machine.id === "ins-100").capital_cost_usd += 1;
    expect(deriveReferenceBalance(machineChange, design, plan, factory).reference_factory_capital_usd)
      .toBeGreaterThan(baseline.reference_factory_capital_usd);
  });

  test("rejects stale stored balance and compiled recipe values", async () => {
    const catalog = await readYaml<any>(join(ROOT, "content/catalog.yaml"));
    const design = await readYaml<any>(join(ROOT, "fixtures/reference/default-qualifying-design.yaml"));
    const plan = await readYaml<any>(join(ROOT, "fixtures/reference/default-manufacturing-plan.yaml"));
    const factory = await readYaml<any>(join(ROOT, "fixtures/reference/complete-reference-factory.yaml"));
    const compiled = await readYaml<any>(join(ROOT, "fixtures/reference/default-compiled-recipes.yaml"));
    catalog.balance.material_cost_per_attempt_usd += 1;
    compiled.recipes[0].cycle_seconds += 1;
    const issues: { path: string; message: string }[] = [];
    validateCatalogReferences(catalog, issues, design, plan, factory, compiled);
    expect(issues.some((issue) => issue.path.endsWith("material_cost_per_attempt_usd"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("compiled recipe fixture is stale"))).toBe(true);
  });

  test("compiles an alternative CP-130 and MD-130 design through compatible templates", async () => {
    const catalog = await readYaml<any>(join(ROOT, "content/catalog.yaml"));
    const reference = await readYaml<any>(join(ROOT, "fixtures/reference/default-qualifying-design.yaml"));
    const referencePlan = await readYaml<any>(join(ROOT, "fixtures/reference/default-manufacturing-plan.yaml"));
    const alternative = structuredClone(reference);
    alternative.design_id = "wide-display-controller";
    alternative.revision = 2;
    alternative.components.find((entry: any) => entry.item_id === "cp-110").item_id = "cp-130";
    alternative.components.find((entry: any) => entry.item_id === "md-110").item_id = "md-130";
    alternative.minimum_quality.find((entry: any) => entry.item_id === "cp-110").item_id = "cp-130";
    alternative.minimum_quality.find((entry: any) => entry.item_id === "md-110").item_id = "md-130";
    const alternativePlan = structuredClone(referencePlan);
    alternativePlan.design_revision_id = "wide-display-controller-r2";
    for (const [oldItem, newItem, offerId] of [
      ["cp-110", "cp-130", "northstar-cp-130-standard"],
      ["md-110", "md-130", "primememory-md-130-premium"],
    ]) {
      const allocation = alternativePlan.lot_allocations.find((entry: any) => entry.item_id === oldItem);
      const offer = catalog.offers.find((entry: any) => entry.id === offerId);
      allocation.item_id = newItem;
      allocation.offer_id = offer.id;
      allocation.supplier = offer.supplier;
      allocation.quality = offer.quality;
      allocation.unit_cost_microusd = offer.unit_price_usd * 1_000_000;
      allocation.defect_probability_ppm = offer.defect_probability * 1_000_000;
      allocation.offer_digest = digest({
        id: offer.id,
        specification_id: offer.specification_id,
        supplier: offer.supplier,
        quality: offer.quality,
        unit_price_usd: offer.unit_price_usd,
        defect_probability: offer.defect_probability,
      });
    }
    alternativePlan.content_digest = manufacturingPlanDigest(alternativePlan);
    const referenceRecipes = compileDesignRecipes(catalog, reference, referencePlan);
    const recipes = compileDesignRecipes(catalog, alternative, alternativePlan);
    expect(recipes[0]!.inputs.map((input) => input.item_id)).toContain("cp-130");
    expect(recipes[0]!.inputs.map((input) => input.item_id)).toContain("md-130");
    expect(recipes.map((recipe) => recipe.workload)).not.toEqual(referenceRecipes.map((recipe) => recipe.workload));
    expect(recipes.every((recipe) => recipe.design_revision_id === "wide-display-controller-r2")).toBe(true);
    expect(recipes.filter((recipe) => recipe.outcome_mode === "exactly_one_seeded"))
      .toHaveLength(2);
  });

  test("rejects different models sharing one starter family input port", async () => {
    const catalog = await readYaml<any>(join(ROOT, "content/catalog.yaml"));
    const design = await readYaml<any>(
      join(ROOT, "fixtures/reference/default-qualifying-design.yaml")
    );
    const plan = await readYaml<any>(join(ROOT, "fixtures/reference/default-manufacturing-plan.yaml"));
    design.components.push({
      instance_id: "compute-2",
      item_id: "cp-130",
      position: { x: 0, y: 0 },
      rotation: 0,
    });
    expect(() => compileDesignRecipes(catalog, design, plan)).toThrow(
      "one exact compute model per design"
    );
  });

  test("lot-bound mixed sourcing changes only manufacturing derivations", async () => {
    const catalog = await readYaml<any>(join(ROOT, "content/catalog.yaml"));
    const design = await readYaml<any>(join(ROOT, "fixtures/reference/default-qualifying-design.yaml"));
    const plan = await readYaml<any>(join(ROOT, "fixtures/reference/default-manufacturing-plan.yaml"));
    const factory = await readYaml<any>(join(ROOT, "fixtures/reference/complete-reference-factory.yaml"));
    const mixed = structuredClone(plan);
    const allocation = mixed.lot_allocations.find((entry: any) => entry.lot_id === "lot-dl-002");
    const offer = catalog.offers.find((entry: any) => entry.id === "valuelink-dl-110-value");
    allocation.offer_id = offer.id;
    allocation.supplier = offer.supplier;
    allocation.quality = offer.quality;
    allocation.unit_cost_microusd = offer.unit_price_usd * 1_000_000;
    allocation.defect_probability_ppm = offer.defect_probability * 1_000_000;
    allocation.offer_digest = digest({
      id: offer.id,
      specification_id: offer.specification_id,
      supplier: offer.supplier,
      quality: offer.quality,
      unit_price_usd: offer.unit_price_usd,
      defect_probability: offer.defect_probability,
    });
    mixed.content_digest = manufacturingPlanDigest(mixed);
    expect(() => validateManufacturingPlan(catalog, design, mixed)).not.toThrow();
    const baseline = deriveReferenceBalance(catalog, design, plan, factory);
    const changed = deriveReferenceBalance(catalog, design, mixed, factory);
    expect(changed.material_cost_per_attempt_usd).toBeLessThan(baseline.material_cost_per_attempt_usd);
    expect(changed.inspection_workload).toBeGreaterThan(baseline.inspection_workload);
    expect(changed.expected_yield).toBeLessThan(baseline.expected_yield);
    expect(design).not.toHaveProperty("selected_offers");
  });
});
