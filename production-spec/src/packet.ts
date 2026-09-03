import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { stringify } from "yaml";
import { digest } from "./canonical.js";
import {
  assertReadyForExport,
  buildRequirementFragmentIndex,
  loadArtifacts,
  loadManifest,
  specificationDigest,
  validateBundle,
} from "./validate.js";
import { readYaml, ROOT } from "./io.js";

export const SHA_PATTERN = /^[0-9a-f]{40}$/;

export async function generatePacket(baseSha: string): Promise<any> {
  if (!SHA_PATTERN.test(baseSha)) throw new Error("--base-sha must be an explicit lowercase 40-hex commit SHA");
  const validation = await validateBundle();
  if (!validation.valid) {
    throw new Error(`Bundle is invalid:\n${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  }
  const manifest = await loadManifest();
  assertReadyForExport(manifest);
  const data = await loadArtifacts(manifest);
  const config = data.get("packet/direction-packet.config.yaml");
  const policy = data.get(config.policy);
  const requirementCatalogs = config.requirement_catalogs.map((path: string) => data.get(path));
  const requirements = requirementCatalogs.flatMap((catalog: any) => catalog.requirements);
  const milestoneRequirements = requirements.filter(
    (requirement: any) => requirement.lifecycle === "milestone"
  );
  const milestones = requirementCatalogs.flatMap((catalog: any) => catalog.milestones);
  const specificationById = new Map(
    [...data.values()]
      .filter((document: any) => document?.rules && document?.id)
      .map((document: any) => [document.id, document])
  );
  const packetRegistryKinds = new Set([
    "actors", "specifications", "suites", "scenarios", "evidence", "environments", "services", "metrics",
  ]);
  const registryDocs = [...data.entries()]
    .filter(([path, value]) => path.startsWith("registries/") && packetRegistryKinds.has(value.kind))
    .map(([, value]) => value);
  const registries = Object.fromEntries(registryDocs.map((registry: any) => [
    registry.kind,
    registry.entries.map((entry: any) => ({
      id: entry.id,
      path: entry.path,
      ...(registry.kind === "metrics" ? { unit: entry.unit } : {}),
    })),
  ]));
  const fragmentIndex = buildRequirementFragmentIndex(
    [...specificationById.values()],
    milestoneRequirements
  );
  const fragmentByRequirement = new Map(fragmentIndex.map((entry) => [entry.requirement_id, entry]));
  const authorizedRules = [...new Map(fragmentIndex.flatMap((entry) =>
    [entry.principal_source, ...entry.linked_sources].map((source) => [
      `${source.specification}/${source.rule}`,
      source,
    ] as const)
  )).values()];
  const ref = (type: string, id: string) => ({ type, id });
  const packet = {
    schema_version: 1,
    identity: { packet_id: config.packet_id, revision: config.revision, title: config.title },
    authority: {
      owner: ref("actor", config.owner),
      approvers: [{ type: "github_user", ...config.approver }],
      supersedes: null,
    },
    source: {
      repository: config.target_repository,
      base_ref: config.base_ref,
      base_revision: baseSha,
      specification_revision: await specificationDigest(manifest, data),
      policy_revision: digest(policy),
    },
    intent: {
      outcome: config.outcome,
      player_experience: [
        { id: "experience-readable-causality", statement: "Players understand why designs, materials, routes, machine states, rejects, and finances produce observed outcomes.", evidence: [ref("suite", "black-box-playtest")] },
        { id: "experience-agent-parity", statement: "A semantic test agent can complete the same goals through public observations and ordinary game commands.", evidence: [ref("suite", "semantic-playtest")] },
      ],
      principles: config.principles,
    },
    scope: {
      included: authorizedRules.map((source) => ({
        id: `scope-${source.specification}-${source.rule}`,
        statement: `Authority is limited to exact rule ${source.specification}${source.fragment} (${source.rule}); no other fragment is implied.`,
        specifications: [{
          ...ref("specification", source.specification),
          fragment: source.fragment,
        }],
      })),
      excluded: config.excluded,
      assumptions: [
        { id: "assumption-empty-target", statement: "The first target base is an initialized empty Unity repository containing this exported bundle and provenance.", disposition: "fixed_for_epoch" },
        { id: "assumption-private-target", statement: "The target remains private to the owner and required service identities.", disposition: "fixed_for_epoch" },
        { id: "assumption-factory-preflight", statement: "Before submission, the deployed factory must verify that the supplied exact target SHA is the observed develop head, workflow checks passed for that SHA, and target provenance plus every exported file, specification, and policy digest match this source-valid local generation; any unexpected head movement invalidates authority pending full revalidation.", disposition: "validate_during_epoch" },
      ],
    },
    requirements: milestoneRequirements.map((requirement: any) => ({
      id: requirement.id,
      statement: requirement.statement,
      source: {
        ...ref("specification", requirement.source.specification),
        fragment: fragmentByRequirement.get(requirement.id)!.principal_source.fragment,
      },
      priority: requirement.priority,
      acceptance: requirement.acceptance.map((check: any) => ({ check_id: check.check_id, type: check.type })),
    })),
    constraints: {
      architecture: [
        { id: "constraint-pure-domain", statement: "Authoritative rules are pure C# and independent of Unity rendering.", enforcement: "required_check" },
        { id: "constraint-shared-command-boundary", statement: "Human, agent, and replay adapters use the same typed command handlers.", enforcement: "protected_interface" },
        { id: "constraint-unity-version", statement: "Unity editor is exactly 6000.3.23f1 with URP.", enforcement: "required_check" },
      ],
      compatibility: [
        { id: "constraint-platforms", statement: "Windows x86-64 and macOS Universal launch natively.", enforcement: "required_check" },
        { id: "constraint-save-migrations", statement: "Save and replay incompatibility migrates explicitly or fails visibly.", enforcement: "protected_interface" },
      ],
      performance: [
        { metric: ref("metric", "frame-time-p95"), operator: "less_than_or_equal", value: 16.67, unit: "milliseconds", environment: ref("environment", "windows-reference") },
        { metric: ref("metric", "cold-main-menu-load"), operator: "less_than_or_equal", value: 10000, unit: "milliseconds", environment: ref("environment", "windows-reference") },
        { metric: ref("metric", "process-ram"), operator: "less_than", value: 4096, unit: "megabytes", environment: ref("environment", "windows-reference") },
      ],
      accessibility: [
        { id: "constraint-accessibility", statement: "Required management actions are keyboard reachable with scalable text, reduced motion, remapping, and color-independent cues.", enforcement: "required_check" },
      ],
      security: [
        { id: "constraint-agent-local", statement: "Semantic HTTP is opt-in, token-authenticated, loopback-only, and isolated from human saves.", enforcement: "required_check" },
        { id: "constraint-private-repo", statement: "The target repository is private and least-privilege.", enforcement: "human_review" },
      ],
      privacy: [
        { id: "constraint-local-telemetry", statement: "Runtime telemetry stays local; no external analytics or crash reporting.", enforcement: "required_check" },
      ],
      provenance: [
        { id: "constraint-asset-provenance", statement: "All dependencies and assets have allowed license, pinned source, justification, scan, and provenance.", enforcement: "reviewer_policy" },
        { id: "constraint-source-provenance", statement: "The initial target commit records source repository, source SHA, bundle digest, and policy digest.", enforcement: "required_check" },
      ],
      dependencies: {
        new_dependencies: "allowed",
        allowed_services: registries.services.map((entry: any) => ref("service", entry.id)),
      },
    },
    milestones: milestones.map((milestone: any) => ({
      id: milestone.id,
      title: milestone.title,
      outcomes: milestoneRequirements
        .filter((requirement: any) => requirement.milestone === milestone.id)
        .map((requirement: any) => ref("requirement", requirement.id)),
      depends_on: milestone.depends_on.map((id: string) => ref("milestone", id)),
      checkpoint_required: milestone.checkpoint_required,
    })),
    verification: {
      required_suites: registries.suites.map((entry: any) => ref("suite", entry.id)),
      scenarios: registries.scenarios.map((entry: any) => ref("scenario", entry.id)),
      reference_environments: registries.environments.map((entry: any) => ref("environment", entry.id)),
      evidence_retention_days: policy.retention_days,
    },
    authority_policy: {
      autonomous_change_classes: ["A", "B"],
      provisional_decisions: [],
      protected_paths: [
        "specifications/**",
        "scenarios/**",
        "environments/**",
        "verification/**",
        "content/runtime/**",
        "code-factory/registries/**",
        "code-factory/policy/**",
        "code-factory/direction-packets/**",
        "code-factory/schemas/**",
        "specification-provenance.json",
      ],
      human_approval_topics: ["product_direction", "public_protocol_semantics", "licensing_exception", "security_exception", "privacy_exception", "budget_expansion", "scope_expansion", "protected_path_change"],
    },
    budgets: {
      epoch: { wall_time_days: policy.epoch.wall_time_days, external_cost_cents: policy.epoch.external_cost_cents, agent_tasks: policy.epoch.agent_tasks },
      retries: { per_task: policy.epoch.retries_per_task, per_failure_signature: policy.epoch.retries_per_unchanged_failure },
      concurrency: { authors: policy.epoch.authors, reviewers: policy.epoch.reviewers, integrators: policy.epoch.integrators, rendered_playtests: policy.epoch.rendered_playtests },
      contingency_percent: policy.epoch.contingency_percent,
    },
    checkpoint: {
      trigger: { type: "all_milestones_complete" },
      deliverables: ["playable_build", "guided_test_route", "requirement_coverage", "semantic_playtest_report", "black_box_recordings", "performance_report", "deferred_scope", "realignment_questions"],
      owner: ref("actor", config.owner),
    },
    notifications: { digest_interval_hours: 24, immediate: ["hard_stop", "critical_path_decision", "main_branch_unhealthy", "budget_warning", "checkpoint_ready"] },
    stop_conditions: [
      { id: "stop-integration-unhealthy", condition: "main_branch_unhealthy", threshold: { duration_minutes: 1 }, scope: "global", disposition: "halt_epoch" },
      { id: "stop-budget", condition: "budget_consumed", threshold: { percent: 100 }, scope: "global", disposition: "halt_epoch" },
      { id: "stop-critical-blocked", condition: "critical_path_blocked", threshold: { duration_minutes: 1440 }, scope: "global", disposition: "halt_epoch" },
      { id: "stop-security", condition: "security_incident", scope: "global", disposition: "halt_epoch" },
      { id: "stop-integrity", condition: "integrity_failure", scope: "global", disposition: "halt_epoch" },
      { id: "stop-outside-authority", condition: "decision_outside_packet", scope: "affected_branch", disposition: "halt_affected_branch" },
    ],
    open_questions: [],
    registries,
  };
  await validatePacket(packet);
  return packet;
}

export async function validatePacket(packet: unknown): Promise<void> {
  const schema = JSON.parse(await readFile(join(ROOT, "packet/vendor/direction-packet-v1.schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const valid = ajv.validate(schema, packet);
  if (!valid) throw new Error(`Direction Packet v1 validation failed:\n${(ajv.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join("\n")}`);
}

export function packetYaml(packet: unknown): string {
  return stringify(packet, { lineWidth: 0, sortMapEntries: false });
}
