import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
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
import { compileContent, exportBundle, verifySourceRepository } from "../src/export.js";
import { ROOT } from "../src/io.js";
import { generatePacket, validatePacket } from "../src/packet.js";
import { assertReadyForExport, validateBundle, validateCatalogReferences } from "../src/validate.js";
import { readYaml } from "../src/io.js";

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
    await exportBundle(out, "b".repeat(40), { testOnlySkipRepositoryVerification: true });
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
    const packetConfig = await readYaml<any>(
      join(out, "code-factory/direction-packets/templates/chip-city-foundation-01.config.yaml")
    );
    expect(packetConfig.requirement_catalogs).toEqual([
      "specifications/requirements/foundation.yaml",
      "specifications/requirements/vertical-slice.yaml",
    ]);
    expect(packetConfig.policy).toBe("code-factory/policy/first-run.yaml");
  });

  test("requires an explicit full target base SHA", async () => {
    await expect(generatePacket("main")).rejects.toThrow("--base-sha");
  });

  test("draft bundles cannot export or generate packet authority", () => {
    expect(() => assertReadyForExport({ status: "draft", artifacts: [] }))
      .toThrow("Only a ready author-complete bundle");
  });

  test("normal source verification rejects mismatched and dirty source revisions", async () => {
    const repository = join(WORK, "source-repository");
    await mkdir(join(repository, "production-spec"), { recursive: true });
    await writeFile(join(repository, "production-spec", "authority.yaml"), "status: draft\n");
    const git = async (...args: string[]) =>
      execFileAsync("git", ["-C", repository, ...args], { encoding: "utf8" });
    await git("init", "--quiet");
    await git("config", "user.name", "Production Spec Test");
    await git("config", "user.email", "production-spec@example.invalid");
    await git("add", "production-spec/authority.yaml");
    await git("commit", "--quiet", "-m", "fixture");
    const head = (await git("rev-parse", "HEAD")).stdout.trim();
    await expect(verifySourceRepository("a".repeat(40), repository)).rejects.toThrow("does not match checked-out HEAD");
    await expect(verifySourceRepository(head, repository)).resolves.toBeUndefined();
    await writeFile(join(repository, "production-spec", "authority.yaml"), "status: changed\n");
    await expect(verifySourceRepository(head, repository)).rejects.toThrow("not clean");
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
