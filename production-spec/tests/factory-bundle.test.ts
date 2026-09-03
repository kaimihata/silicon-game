import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { canonicalJson } from "../src/canonical.js";
import { exportBundle } from "../src/export.js";
import {
  buildEvidenceAdapters,
  FACTORY_BUNDLE_MAX_BYTES,
  FACTORY_FILE_MAX_BYTES,
  FACTORY_SELECTED_MAX_BYTES,
  type GameSpecBundleV1,
  selectFactoryBundleFiles,
  validateFactoryBundleDirectory,
  validateFactoryBundleManifest
} from "../src/factory-bundle.js";
import { readYaml, ROOT } from "../src/io.js";
import { generatePacket } from "../src/packet.js";

const WORK = join(ROOT, "tests/.factory-generated");
const BASE = join(WORK, "base");
const GOLDEN = join(ROOT, "fixtures/generated/game-spec-bundle-v1.json");

function hash(source: Buffer | string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function readBaseBundle(): Promise<GameSpecBundleV1> {
  return JSON.parse(await readFile(join(BASE, "bundle.json"), "utf8"));
}

async function copyBase(name: string): Promise<string> {
  const destination = join(WORK, name);
  await cp(BASE, destination, {recursive: true});
  return destination;
}

beforeAll(async () => {
  await rm(WORK, {recursive: true, force: true});
  await exportBundle(BASE, "b".repeat(40), {testOnlySkipRepositoryVerification: true});
  if (process.env.UPDATE_FACTORY_BUNDLE_GOLDEN === "1") {
    await mkdir(join(ROOT, "fixtures/generated"), {recursive: true});
    await cp(join(BASE, "bundle.json"), GOLDEN);
  }
});

afterAll(async () => {
  await rm(WORK, {recursive: true, force: true});
});

describe("factory game-spec bundle v1", () => {
  test("matches deterministic golden bytes and Direction Packet specification revision", async () => {
    const source = await readFile(join(BASE, "bundle.json"));
    const golden = await readFile(GOLDEN);
    const bundle = JSON.parse(source.toString("utf8")) as GameSpecBundleV1;
    const packet = await generatePacket("a".repeat(40));
    const provenance = JSON.parse(
      await readFile(join(BASE, "specification-provenance.json"), "utf8")
    );

    expect(source.equals(golden)).toBe(true);
    expect(source.equals(Buffer.from(canonicalJson(bundle)))).toBe(true);
    expect(source.at(-1)).not.toBe(0x0a);
    expect(bundle.state).toBe("ready");
    expect(bundle.specification_revision).toBe(packet.source.specification_revision);
    expect(provenance.planner_bundle).toEqual({
      schema_id: "https://schemas.silicon-code-factory.dev/game-spec-bundle-v1.schema.json",
      path: "bundle.json",
      digest: `sha256:${hash(source)}`,
      planner_digest_environment: "PLANNER_SPEC_BUNDLE_DIGEST",
      source_specification_revision: packet.source.specification_revision,
      canonicalization: "RFC 8785",
      execution_authority: false
    });
    expect(JSON.stringify(bundle)).not.toContain("bundle_review_disposition");
  });

  test("exports every closed role with unique canonical files and bounded selectors", async () => {
    const bundle = await readBaseBundle();
    const expectedRoles = [
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
    ];
    expect([...new Set(bundle.files.map((file) => file.role))].sort())
      .toEqual(expectedRoles.sort());
    expect(new Set(bundle.files.map((file) => file.id)).size).toBe(bundle.files.length);
    expect(new Set(bundle.files.map((file) => file.path)).size).toBe(bundle.files.length);
    expect(bundle.files.length).toBeLessThanOrEqual(128);
    expect(bundle.files.every((file) => file.bytes <= FACTORY_FILE_MAX_BYTES)).toBe(true);
    expect(bundle.files.every((file) => /^sha256:[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    expect(bundle.evidence_adapters.every((adapter) => adapter.profile.version === "1")).toBe(true);
    expect(bundle.files.every((file) =>
      file.requirement_ids.length <= 100 && file.milestone_ids.length <= 100
    )).toBe(true);
    await expect(validateFactoryBundleDirectory(BASE, bundle)).resolves.toEqual(bundle);
  });

  test("selects global and matching files and enforces the aggregate cap", async () => {
    const bundle = await readBaseBundle();
    const global = selectFactoryBundleFiles(bundle);
    const selected = selectFactoryBundleFiles(bundle, ["req.foundation.unity"]);
    expect(global.every((file) =>
      file.requirement_ids.length === 0 && file.milestone_ids.length === 0
    )).toBe(true);
    expect(selected.length).toBeGreaterThan(global.length);
    expect(selected.reduce((sum, file) => sum + file.bytes, 0))
      .toBeLessThanOrEqual(FACTORY_SELECTED_MAX_BYTES);

    const oversized = structuredClone(bundle);
    oversized.files = Array.from({length: 9}, (_, index) => ({
      ...bundle.files[0]!,
      id: `rule.synthetic-${index}`,
      path: `factory-spec/rules/synthetic-${index}.json`,
      bytes: FACTORY_FILE_MAX_BYTES,
      requirement_ids: [],
      milestone_ids: []
    }));
    expect(() => selectFactoryBundleFiles(oversized)).toThrow("maximum");
  });

  test("rejects tampered bytes and noncanonical fragments", async () => {
    const tamperedRoot = await copyBase("tampered");
    const tamperedBundle = await readBaseBundle();
    const file = tamperedBundle.files[0]!;
    await writeFile(join(tamperedRoot, file.path), "tampered");
    await expect(validateFactoryBundleDirectory(tamperedRoot)).rejects.toThrow(
      /byte count mismatch|digest mismatch/
    );

    const noncanonicalRoot = await copyBase("noncanonical-fragment");
    const noncanonicalBundle = await readBaseBundle();
    const jsonFile = noncanonicalBundle.files[0]!;
    const value = JSON.parse(await readFile(join(noncanonicalRoot, jsonFile.path), "utf8"));
    const pretty = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(join(noncanonicalRoot, jsonFile.path), pretty);
    jsonFile.bytes = Buffer.byteLength(pretty);
    jsonFile.sha256 = `sha256:${hash(pretty)}`;
    await writeFile(join(noncanonicalRoot, "bundle.json"), canonicalJson(noncanonicalBundle));
    await expect(validateFactoryBundleDirectory(noncanonicalRoot)).rejects.toThrow(
      "not exact canonical JSON"
    );
  });

  test("rejects noncanonical and oversized bundle bytes", async () => {
    const newlineRoot = await copyBase("bundle-newline");
    const source = await readFile(join(newlineRoot, "bundle.json"));
    await writeFile(join(newlineRoot, "bundle.json"), Buffer.concat([source, Buffer.from("\n")]));
    await expect(validateFactoryBundleDirectory(newlineRoot)).rejects.toThrow(
      "not exact RFC 8785"
    );

    const oversizedRoot = join(WORK, "oversized-bundle");
    await mkdir(oversizedRoot, {recursive: true});
    await writeFile(
      join(oversizedRoot, "bundle.json"),
      Buffer.alloc(FACTORY_BUNDLE_MAX_BYTES + 1, 0x20)
    );
    await expect(validateFactoryBundleDirectory(oversizedRoot)).rejects.toThrow("exceeds");
  });

  test("rejects traversal, duplicate paths, file size, and file count", async () => {
    const bundle = await readBaseBundle();
    const traversal = structuredClone(bundle);
    traversal.files[0]!.path = "../escape.json";
    await expect(validateFactoryBundleManifest(traversal)).rejects.toThrow(
      /Invalid game spec bundle|Unsafe/
    );

    const duplicate = structuredClone(bundle);
    duplicate.files[1]!.path = duplicate.files[0]!.path;
    await expect(validateFactoryBundleManifest(duplicate)).rejects.toThrow(
      "Duplicate factory file path"
    );

    const oversized = structuredClone(bundle);
    oversized.files[0]!.bytes = FACTORY_FILE_MAX_BYTES + 1;
    await expect(validateFactoryBundleManifest(oversized)).rejects.toThrow(
      "Invalid game spec bundle"
    );

    const tooMany = structuredClone(bundle);
    while (tooMany.files.length < 129) {
      const index = tooMany.files.length;
      tooMany.files.push({
        ...tooMany.files[0]!,
        id: `rule.extra-${index}`,
        path: `factory-spec/rules/extra-${index}.json`
      });
    }
    await expect(validateFactoryBundleManifest(tooMany)).rejects.toThrow(
      "Invalid game spec bundle"
    );
  });

  test("requires an exact evidence registry mapping", async () => {
    const registry = await readYaml<any>(join(ROOT, "registries/evidence.yaml"));
    const adapters = buildEvidenceAdapters(registry);
    expect(adapters.map((adapter) => adapter.spec_evidence_id).sort())
      .toEqual(registry.entries.map((entry: any) => entry.id).sort());
    expect(adapters.map(({spec_evidence_id, factory_kind, authorized_producers}) => ({
      spec_evidence_id,
      factory_kind,
      authorized_producers
    }))).toEqual([
      {spec_evidence_id: "accessibility-snapshot", factory_kind: "test_report", authorized_producers: ["windows_gpu_rendered"]},
      {spec_evidence_id: "accounting-report", factory_kind: "semantic_playtest_report", authorized_producers: ["windows_gpu_semantic"]},
      {spec_evidence_id: "audit-log", factory_kind: "log_bundle", authorized_producers: ["windows_gpu_semantic", "windows_gpu_rendered", "macos_build", "macos_smoke"]},
      {spec_evidence_id: "black-box-recording", factory_kind: "rendered_playtest_recording", authorized_producers: ["windows_gpu_rendered"]},
      {spec_evidence_id: "content-provenance", factory_kind: "artifact_manifest", authorized_producers: ["macos_build"]},
      {spec_evidence_id: "decision-trace", factory_kind: "log_bundle", authorized_producers: ["windows_gpu_semantic", "windows_gpu_rendered"]},
      {spec_evidence_id: "domain-results", factory_kind: "semantic_playtest_report", authorized_producers: ["windows_gpu_semantic"]},
      {spec_evidence_id: "input-trace", factory_kind: "log_bundle", authorized_producers: ["windows_gpu_semantic", "windows_gpu_rendered"]},
      {spec_evidence_id: "performance-report", factory_kind: "performance_report", authorized_producers: ["windows_gpu_rendered"]},
      {spec_evidence_id: "persistence-results", factory_kind: "semantic_playtest_report", authorized_producers: ["windows_gpu_semantic"]},
      {spec_evidence_id: "replay", factory_kind: "log_bundle", authorized_producers: ["windows_gpu_semantic"]},
      {spec_evidence_id: "requirement-coverage", factory_kind: "semantic_playtest_report", authorized_producers: ["windows_gpu_semantic"]},
      {spec_evidence_id: "screenshots", factory_kind: "screenshot", authorized_producers: ["windows_gpu_rendered"]},
      {spec_evidence_id: "semantic-report", factory_kind: "semantic_playtest_report", authorized_producers: ["windows_gpu_semantic"]},
      {spec_evidence_id: "video", factory_kind: "video", authorized_producers: ["windows_gpu_rendered"]}
    ]);
    expect(adapters.find((adapter) => adapter.spec_evidence_id === "accessibility-snapshot")?.profile)
      .toMatchObject({
        id: "profile.accessibility-snapshot.runtime-semantics",
        json_schema: {
          title: "Runtime accessibility semantics snapshot"
        }
      });
    expect(adapters.find((adapter) => adapter.spec_evidence_id === "performance-report")?.profile)
      .toMatchObject({
        id: "profile.performance-report.windows-rendered",
        json_schema: {
          title: "Windows rendered performance measurement"
        }
      });

    const unknown = structuredClone(registry);
    unknown.entries.push({id: "new-unmapped-evidence"});
    expect(() => buildEvidenceAdapters(unknown)).toThrow("missing=[new-unmapped-evidence]");

    const missing = structuredClone(registry);
    missing.entries = missing.entries.filter((entry: any) => entry.id !== "replay");
    expect(() => buildEvidenceAdapters(missing)).toThrow("stale=[replay]");
  });

  test("rejects invalid evidence delivery, producer compatibility, and external schema refs", async () => {
    const bundle = await readBaseBundle();
    const numericVersion = structuredClone(bundle) as any;
    numericVersion.evidence_adapters[0].profile.version = 1;
    await expect(validateFactoryBundleManifest(numericVersion)).rejects.toThrow(
      "Invalid game spec bundle"
    );

    const delivery = structuredClone(bundle);
    const artifact = delivery.evidence_adapters.find(
      (adapter) => adapter.factory_kind === "video"
    )!;
    artifact.delivery.mode = "inline";
    await expect(validateFactoryBundleManifest(delivery)).rejects.toThrow(
      "Invalid game spec bundle"
    );

    const producer = structuredClone(bundle);
    const performance = producer.evidence_adapters.find(
      (adapter) => adapter.factory_kind === "performance_report"
    )!;
    performance.authorized_producers = ["macos_build"];
    await expect(validateFactoryBundleManifest(producer)).rejects.toThrow(
      /Invalid game spec bundle|incompatible/
    );

    const externalRef = structuredClone(bundle);
    externalRef.evidence_adapters[0]!.profile.json_schema = {
      $ref: "https://example.invalid/evidence.schema.json"
    };
    await expect(validateFactoryBundleManifest(externalRef)).rejects.toThrow(
      "must be a local JSON Pointer"
    );
  });
});
