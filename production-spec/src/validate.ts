import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { digest } from "./canonical.js";
import {
  compileDesignRecipes,
  deriveReferenceBalance,
  manufacturingPlanDigest,
  validateManufacturingPlan,
} from "./derive.js";
import { listFiles, readYaml, ROOT } from "./io.js";
import { targetPathForArtifact, targetSchemaPath } from "./layout.js";

export type Artifact = { path: string; kind: string; schema: string };
export type Manifest = { status: "draft" | "ready"; artifacts: Artifact[] };
export type Issue = { path: string; message: string };
export type ValidationResult = { valid: boolean; issues: Issue[]; bundleDigest?: string; policyDigest?: string };

export type RequirementFragment = {
  requirement_id: string;
  principal_source: { specification: string; rule: string; fragment: string };
  linked_sources: { specification: string; rule: string; fragment: string }[];
};

function duplicateIssues(values: string[], path: string): Issue[] {
  const seen = new Set<string>();
  return values.flatMap((value) =>
    seen.has(value) ? [{ path, message: `duplicate id ${value}` }] : (seen.add(value), [])
  );
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

export async function loadManifest(root = ROOT): Promise<Manifest> {
  return readYaml<Manifest>(join(root, "bundle.yaml"));
}

export function assertReadyForExport(manifest: Manifest): void {
  if (manifest.status !== "ready") {
    throw new Error("Only a ready author-complete bundle may be exported or used to generate a Direction Packet");
  }
}

export async function loadArtifacts(manifest: Manifest, root = ROOT): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  for (const artifact of manifest.artifacts) map.set(artifact.path, await readYaml(join(root, artifact.path)));
  return map;
}

export async function specificationDigest(
  manifest: Manifest,
  data: Map<string, any>,
  root = ROOT,
): Promise<string> {
  const entries = manifest.artifacts
    .filter((artifact) => !["policy", "packet_config"].includes(artifact.kind))
    .map((artifact) => [targetPathForArtifact(artifact), data.get(artifact.path)]);
  const schemaEntries = await Promise.all(
    (await listFiles(join(root, "schemas"), ".json")).map(async (path) => [
      targetSchemaPath(path),
      JSON.parse(await readFile(path, "utf8")),
    ])
  );
  return digest(Object.fromEntries([...entries, ...schemaEntries]));
}

export function buildRequirementFragmentIndex(specs: any[], requirements: any[], issues: Issue[] = []): RequirementFragment[] {
  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  const resolveSource = (requirementId: string, source: any) => {
    const spec = specById.get(source.specification);
    if (!spec) {
      issues.push({ path: requirementId, message: `unknown specification ${source.specification}` });
      return undefined;
    }
    const ruleIndex = spec.rules.findIndex((rule: any) => rule.id === source.rule);
    if (ruleIndex < 0) {
      issues.push({ path: requirementId, message: `unknown source rule ${source.rule}` });
      return undefined;
    }
    const fragment = `/rules/${ruleIndex}`;
    if (spec.rules[Number(fragment.slice("/rules/".length))]?.id !== source.rule) {
      issues.push({ path: requirementId, message: `invalid generated fragment ${fragment}` });
      return undefined;
    }
    return { specification: source.specification, rule: source.rule, fragment };
  };
  return requirements.flatMap((requirement) => {
    const principal = resolveSource(requirement.id, requirement.source);
    const linked = (requirement.linked_sources ?? [])
      .map((source: any) => resolveSource(requirement.id, source))
      .filter(Boolean);
    return principal ? [{
      requirement_id: requirement.id,
      principal_source: principal,
      linked_sources: linked,
    }] : [];
  });
}

export async function validateBundle(root = ROOT): Promise<ValidationResult> {
  const issues: Issue[] = [];
  let manifest: Manifest;
  try {
    manifest = await loadManifest(root);
  } catch (error) {
    return { valid: false, issues: [{ path: "bundle.yaml", message: String(error) }] };
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const manifestSchema = JSON.parse(await readFile(join(root, "schemas/bundle-manifest.schema.json"), "utf8"));
  if (!ajv.validate(manifestSchema, await readYaml(join(root, "bundle.yaml")))) {
    issues.push(...(ajv.errors ?? []).map((error) => ({
      path: `bundle.yaml${error.instancePath}`,
      message: error.message ?? "schema error",
    })));
  }
  issues.push(...duplicateIssues(manifest.artifacts.map((artifact) => artifact.path), "bundle.yaml/artifacts"));

  const authoredRoots = [
    "specifications", "content", "fixtures", "requirements", "scenarios",
    "environments", "registries", "verification", "policy", "packet", "target-bootstrap",
  ];
  const actual = (await Promise.all(authoredRoots.map(async (directory) =>
    (await listFiles(join(root, directory), ".yaml")).map((path) => relative(root, path))
  ))).flat().sort();
  const declared = manifest.artifacts.map((artifact) => artifact.path).sort();
  for (const path of actual.filter((path) => !declared.includes(path))) {
    issues.push({ path, message: "authored YAML is missing from manifest" });
  }
  for (const path of declared.filter((path) => !actual.includes(path))) {
    issues.push({ path, message: "manifest artifact does not exist" });
  }

  const data = new Map<string, any>();
  const validators = new Map<string, ReturnType<typeof ajv.compile>>();
  for (const artifact of manifest.artifacts) {
    try {
      const parsed = await readYaml(join(root, artifact.path));
      data.set(artifact.path, parsed);
      let validate = validators.get(artifact.schema);
      if (!validate) {
        validate = ajv.compile(JSON.parse(await readFile(join(root, artifact.schema), "utf8")));
        validators.set(artifact.schema, validate);
      }
      if (!validate(parsed)) {
        issues.push(...(validate.errors ?? []).map((error) => ({
          path: `${artifact.path}${error.instancePath}`,
          message: error.message ?? "schema error",
        })));
      }
    } catch (error) {
      issues.push({ path: artifact.path, message: String(error) });
    }
  }
  if (issues.length) return { valid: false, issues };

  const specs = manifest.artifacts.filter((artifact) => artifact.kind === "specification").map((artifact) => data.get(artifact.path));
  issues.push(...duplicateIssues(specs.map((spec) => spec.id), "specifications"));
  for (const spec of specs) issues.push(...duplicateIssues(spec.rules.map((rule: any) => rule.id), `${spec.id}/rules`));

  const catalogs = manifest.artifacts.filter((artifact) => artifact.kind === "requirements").map((artifact) => data.get(artifact.path));
  const milestones = catalogs.flatMap((catalog) => catalog.milestones);
  const requirements = catalogs.flatMap((catalog) => catalog.requirements);
  const milestoneById = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  issues.push(...duplicateIssues(milestones.map((item) => item.id), "milestones"));
  issues.push(...duplicateIssues(requirements.map((item) => item.id), "requirements"));
  const acceptanceChecks = requirements.flatMap((requirement) =>
    requirement.acceptance.map((check: any) => ({ ...check, requirement }))
  );
  issues.push(...duplicateIssues(acceptanceChecks.map((check) => check.check_id), "acceptance-checks"));
  const fragments = buildRequirementFragmentIndex(specs, requirements, issues);
  const fragmentDocument = { schema_version: 1, status: "ready", entries: fragments };
  const fragmentSchema = JSON.parse(
    await readFile(join(root, "schemas/requirement-fragment-index.schema.json"), "utf8")
  );
  if (!ajv.validate(fragmentSchema, fragmentDocument)) {
    issues.push(...(ajv.errors ?? []).map((error) => ({
      path: `traceability/requirement-fragments${error.instancePath}`,
      message: error.message ?? "schema error",
    })));
  }
  if (fragments.length !== requirements.length) {
    issues.push({ path: "traceability/requirement-fragments", message: "generated fragment index is incomplete" });
  }
  const bundle = await readYaml<any>(join(root, "bundle.yaml"));
  if (bundle.status === "ready") {
    for (const [path, artifact] of data) {
      if (artifact.status !== "ready") {
        issues.push({ path, message: "ready bundle may contain only ready authored artifacts" });
      }
    }
  }
  const coveredRules = new Set(fragments.flatMap((entry) => [
    `${entry.principal_source.specification}/${entry.principal_source.rule}`,
    ...entry.linked_sources.map((source) => `${source.specification}/${source.rule}`),
  ]));
  for (const spec of specs) {
    for (const rule of spec.rules.filter((candidate: any) => candidate.level === "normative")) {
      if (!coveredRules.has(`${spec.id}/${rule.id}`)) {
        issues.push({ path: `${spec.id}/${rule.id}`, message: "normative rule has no explicit requirement coverage" });
      }
    }
  }

  const registryDocuments = manifest.artifacts
    .filter((artifact) => artifact.kind === "registry")
    .map((artifact) => data.get(artifact.path));
  const registry = new Map<string, Map<string, any>>(registryDocuments.map((document) => [
    document.kind,
    new Map(document.entries.map((entry: any) => [entry.id, entry])),
  ]));
  for (const document of registryDocuments) {
    issues.push(...duplicateIssues(document.entries.map((entry: any) => entry.id), `registries/${document.kind}`));
  }
  const targetFiles = new Set([
    ...manifest.artifacts.map(targetPathForArtifact),
    ...(await listFiles(join(root, "schemas"), ".json")).map((path) =>
      targetSchemaPath(join(ROOT, relative(root, path)))
    ),
    "code-factory/schemas/direction-packet-v1.schema.json",
    "content/runtime/catalog.json",
    "content/runtime/catalog.provenance.json",
    "specifications/traceability/requirement-fragments.json",
    "README.specification-import.md",
  ]);
  for (const document of registryDocuments.filter((item) => !["evidence", "checks"].includes(item.kind))) {
    for (const entry of document.entries) {
      if (!targetFiles.has(entry.path)) {
        issues.push({ path: `${document.id}/${entry.id}`, message: `registry path is not exported: ${entry.path}` });
      }
    }
  }

  for (const milestone of milestones) {
    if (!registry.get("actors")?.has(milestone.owner)) {
      issues.push({ path: milestone.id, message: `unknown milestone owner ${milestone.owner}` });
    }
    for (const dependency of milestone.depends_on) {
      if (!milestoneById.has(dependency)) issues.push({ path: milestone.id, message: `unknown dependency ${dependency}` });
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issues.push({ path: id, message: "milestone dependency cycle" });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of milestoneById.get(id)?.depends_on ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  milestones.forEach((item) => visit(item.id));
  const checkpointMilestones = milestones.filter((milestone) => milestone.checkpoint_required);
  if (
    checkpointMilestones.length !== 1 ||
    checkpointMilestones[0]?.id !== "playable-vertical-slice"
  ) {
    issues.push({ path: "milestones", message: "exactly the final playable milestone must generate the single candidate checkpoint" });
  }

  for (const requirement of requirements) {
    if (requirement.lifecycle === "milestone" && !milestoneById.has(requirement.milestone)) {
      issues.push({ path: requirement.id, message: `unknown milestone ${requirement.milestone}` });
    }
    if (requirement.lifecycle === "post_checkpoint_transition" && requirement.milestone !== undefined) {
      issues.push({ path: requirement.id, message: "post-checkpoint transition must not be a milestone requirement" });
    }
    if (
      requirement.lifecycle === "milestone" &&
      requirement.acceptance.some((check: any) => check.type === "human_review")
    ) {
      issues.push({ path: requirement.id, message: "human personal approval cannot be an automated milestone requirement" });
    }
    if (
      requirement.lifecycle === "post_checkpoint_transition" &&
      requirement.acceptance.some((check: any) => check.type !== "human_review")
    ) {
      issues.push({ path: requirement.id, message: "post-checkpoint human promotion must remain a human review transition" });
    }
    for (const check of requirement.acceptance) {
      if (!registry.get("suites")?.has(check.suite)) {
        issues.push({ path: check.check_id, message: `unknown suite ${check.suite}` });
      }
      if (check.scenario && !registry.get("scenarios")?.has(check.scenario)) {
        issues.push({ path: check.check_id, message: `unknown scenario ${check.scenario}` });
      }
    }
  }

  const verificationPlan = data.get("verification/plan.yaml");
  const planSuites = new Map<string, any>(verificationPlan.suites.map((suite: any) => [suite.id, suite]));
  const runners = new Map<string, any>(verificationPlan.runner_contracts.map((runner: any) => [runner.id, runner]));
  const fixtures = new Map<string, any>(verificationPlan.fixtures.map((fixture: any) => [fixture.id, fixture]));
  const planAssertions = new Map<string, any>(verificationPlan.scenario_assertions.map((assertion: any) => [assertion.id, assertion]));
  issues.push(...duplicateIssues(verificationPlan.suites.map((suite: any) => suite.id), "verification/suites"));
  issues.push(...duplicateIssues(verificationPlan.runner_contracts.map((runner: any) => runner.id), "verification/runners"));
  issues.push(...duplicateIssues(verificationPlan.fixtures.map((fixture: any) => fixture.id), "verification/fixtures"));
  issues.push(...duplicateIssues(
    verificationPlan.fixtures.flatMap((fixture: any) => fixture.state_assertions.map((assertion: any) => assertion.id)),
    "verification/fixture-assertions",
  ));
  issues.push(...duplicateIssues(verificationPlan.scenario_assertions.map((assertion: any) => assertion.id), "verification/assertions"));
  for (const suite of registry.get("suites")?.values() ?? []) {
    if (suite.path !== "verification/plan.yaml" || !planSuites.has(suite.id)) {
      issues.push({ path: suite.id, message: "suite must resolve to its definition in verification/plan.yaml" });
    }
  }
  for (const suite of verificationPlan.suites) {
    for (const runner of suite.runner_contracts) {
      if (!runners.has(runner)) issues.push({ path: suite.id, message: `unknown runner contract ${runner}` });
    }
    for (const fixture of verificationPlan.fixtures) {
      if (!runners.has(fixture.setup_contract)) {
        issues.push({ path: fixture.id, message: `unknown fixture setup contract ${fixture.setup_contract}` });
      }
    }
  }

  const checkDefinitions: Map<string, any> = registry.get("checks") ?? new Map<string, any>();
  if (checkDefinitions.size !== acceptanceChecks.length) {
    issues.push({ path: "registries/checks", message: "verification registry must cover acceptance checks exactly once" });
  }
  const acceptanceById = new Map(acceptanceChecks.map((check) => [check.check_id, check]));
  for (const acceptance of acceptanceChecks) {
    const definition: any = checkDefinitions.get(acceptance.check_id);
    if (!definition) {
      issues.push({ path: acceptance.check_id, message: "acceptance check has no verification producer definition" });
      continue;
    }
    if (definition.suite !== acceptance.suite || definition.scenario !== acceptance.scenario) {
      issues.push({ path: acceptance.check_id, message: "verification binding does not match acceptance suite/scenario" });
    }
  }
  for (const [id, definition] of checkDefinitions) {
    const check: any = definition;
    if (!acceptanceById.has(String(id))) issues.push({ path: String(id), message: "verification registry entry has no acceptance check" });
    if (!planSuites.has(check.suite)) issues.push({ path: String(id), message: `unknown verification suite ${check.suite}` });
    if (check.scenario && !registry.get("scenarios")?.has(check.scenario)) issues.push({ path: String(id), message: `unknown scenario ${check.scenario}` });
    if (check.fixture && !fixtures.has(check.fixture)) issues.push({ path: String(id), message: `unknown fixture ${check.fixture}` });
    if (!registry.get("environments")?.has(check.environment)) issues.push({ path: String(id), message: `unknown environment ${check.environment}` });
    if (!registry.get("actors")?.has(check.producer.actor)) issues.push({ path: String(id), message: `unknown producer ${check.producer.actor}` });
    if (!registry.get("actors")?.has(check.evaluator.actor)) issues.push({ path: String(id), message: `unknown evaluator ${check.evaluator.actor}` });
    if (check.producer.actor === check.evaluator.actor || check.producer.class === check.evaluator.class) {
      issues.push({ path: String(id), message: "passing evidence producer and evaluator must be independent" });
    }
    if (!runners.has(check.runner_contract)) issues.push({ path: String(id), message: `unknown runner contract ${check.runner_contract}` });
    if (!planSuites.get(check.suite)?.runner_contracts.includes(check.runner_contract)) {
      issues.push({ path: String(id), message: "runner contract is not registered for suite" });
    }
    for (const evidence of check.required_evidence) {
      if (!registry.get("evidence")?.has(evidence)) issues.push({ path: String(id), message: `unknown evidence ${evidence}` });
    }
  }

  const scenarios = manifest.artifacts.filter((artifact) => artifact.kind === "scenario").map((artifact) => data.get(artifact.path));
  issues.push(...duplicateIssues(scenarios.map((scenario) => scenario.id), "scenarios"));
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const usedAssertions: string[] = [];
  for (const scenario of scenarios) {
    if (!milestoneById.has(scenario.milestone)) issues.push({ path: scenario.id, message: `unknown milestone ${scenario.milestone}` });
    if (!registry.get("environments")?.has(scenario.environment)) issues.push({ path: scenario.id, message: `unknown environment ${scenario.environment}` });
    if (!fixtures.has(scenario.initial_state.fixture_id)) issues.push({ path: scenario.id, message: `unknown initial fixture ${scenario.initial_state.fixture_id}` });
    if (!runners.has(scenario.execution_contract.setup_contract)) {
      issues.push({ path: scenario.id, message: `unknown setup contract ${scenario.execution_contract.setup_contract}` });
    }
    if (!runners.has(scenario.execution_contract.runner_contract)) {
      issues.push({ path: scenario.id, message: `unknown scenario runner ${scenario.execution_contract.runner_contract}` });
    }
    for (const requirementId of scenario.requirements) {
      const requirement = requirementById.get(requirementId);
      if (!requirement) {
        issues.push({ path: scenario.id, message: `unknown requirement ${requirementId}` });
      } else if (!requirement.acceptance.some((check: any) => check.scenario === scenario.id)) {
        issues.push({ path: scenario.id, message: `scenario claims ${requirementId} without a matching acceptance check` });
      }
    }
    for (const goal of scenario.goals) {
      const metric: any = registry.get("metrics")?.get(goal.metric);
      if (!metric) {
        issues.push({ path: scenario.id, message: `unknown metric ${goal.metric}` });
      } else if (metric.value_type === "integer" && !Number.isInteger(goal.value)) {
        issues.push({ path: goal.assertion_id, message: `operator value must be an integer for ${metric.unit}` });
      }
      validateScenarioAssertion(goal.assertion_id, scenario.id, "goal", goal, planAssertions, runners, registry, issues);
      usedAssertions.push(goal.assertion_id);
    }
    for (const [field, kind] of [["invariants", "invariant"], ["required_behaviors", "required_behavior"]] as const) {
      for (const assertion of scenario[field]) {
        validateScenarioAssertion(assertion.assertion_id, scenario.id, kind, assertion, planAssertions, runners, registry, issues);
        usedAssertions.push(assertion.assertion_id);
      }
    }
    for (const evidence of scenario.evidence) {
      if (!registry.get("evidence")?.has(evidence)) issues.push({ path: scenario.id, message: `unknown evidence ${evidence}` });
    }
  }
  issues.push(...duplicateIssues(usedAssertions, "scenarios/assertions"));
  for (const assertionId of planAssertions.keys()) {
    if (!usedAssertions.includes(String(assertionId))) {
      issues.push({ path: String(assertionId), message: "verification assertion is not used by a scenario" });
    }
  }
  for (const requirement of requirements) {
    for (const check of requirement.acceptance.filter((item: any) => item.scenario)) {
      const scenario = scenarioById.get(check.scenario);
      if (scenario && !scenario.requirements.includes(requirement.id)) {
        issues.push({ path: check.check_id, message: `scenario ${check.scenario} does not declare requirement ${requirement.id}` });
      }
    }
  }

  const environmentIds = new Set(
    manifest.artifacts.filter((artifact) => artifact.kind === "environment").map((artifact) => data.get(artifact.path).id)
  );
  for (const id of registry.get("environments")?.keys() ?? []) {
    if (!environmentIds.has(String(id))) issues.push({ path: String(id), message: "environment registry entry has no environment definition" });
  }
  for (const spec of specs) {
    for (const milestone of spec.milestones) {
      if (!milestoneById.has(milestone)) issues.push({ path: spec.id, message: `unknown milestone ${milestone}` });
    }
  }

  const runtimeCatalog = data.get("content/catalog.yaml");
  validateCatalogReferences(
    runtimeCatalog,
    issues,
    data.get("fixtures/reference/default-qualifying-design.yaml"),
    data.get("fixtures/reference/default-manufacturing-plan.yaml"),
    data.get("fixtures/reference/complete-reference-factory.yaml"),
    data.get("fixtures/reference/default-compiled-recipes.yaml"),
  );
  const forbidden = /\b(?:todo|tbd|fixme|placeholder)\b/i;
  for (const [path, value] of data) {
    for (const text of collectStrings(value)) {
      if (forbidden.test(text)) issues.push({ path, message: `unresolved marker in "${text}"` });
    }
  }

  const policy = data.get("policy/first-run.yaml");
  const schemaData = Object.fromEntries(await Promise.all(
    (await listFiles(join(root, "schemas"), ".json")).map(async (path) => [
      relative(root, path),
      JSON.parse(await readFile(path, "utf8")),
    ])
  ));
  const packetSchema = JSON.parse(await readFile(join(root, "packet/vendor/direction-packet-v1.schema.json"), "utf8"));
  return {
    valid: issues.length === 0,
    issues,
    ...(issues.length ? {} : {
      bundleDigest: digest({
        manifest: await readYaml(join(root, "bundle.yaml")),
        artifacts: Object.fromEntries([...data.entries()]),
        schemas: schemaData,
        packet_schema: packetSchema,
      }),
      policyDigest: digest(policy),
    }),
  };
}

function validateScenarioAssertion(
  id: string,
  scenarioId: string,
  kind: string,
  scenarioAssertion: any,
  planAssertions: Map<string, any>,
  runners: Map<string, any>,
  registry: Map<string, Map<string, any>>,
  issues: Issue[],
): void {
  const definition = planAssertions.get(id);
  if (!definition) {
    issues.push({ path: id, message: "scenario assertion has no verification definition" });
    return;
  }
  if (definition.scenario !== scenarioId || definition.kind !== kind) {
    issues.push({ path: id, message: "scenario assertion binding does not match plan" });
  }
  if (kind === "goal" && (
    definition.metric !== scenarioAssertion.metric ||
    definition.operator !== scenarioAssertion.operator ||
    definition.value !== scenarioAssertion.value
  )) {
    issues.push({ path: id, message: "goal metric assertion does not match verification plan" });
  }
  if (kind !== "goal" && !runners.has(definition.runner_contract)) {
    issues.push({ path: id, message: `unknown assertion runner ${definition.runner_contract}` });
  }
  if (!registry.get("actors")?.has(definition.evaluator)) issues.push({ path: id, message: `unknown assertion evaluator ${definition.evaluator}` });
  for (const evidence of definition.required_evidence) {
    if (!registry.get("evidence")?.has(evidence)) issues.push({ path: id, message: `unknown assertion evidence ${evidence}` });
  }
}

export function validateCatalogReferences(
  catalog: any,
  issues: Issue[],
  design?: any,
  manufacturingPlan?: any,
  factory?: any,
  compiledFixture?: any,
): void {
  const ids = [
    ...catalog.components, ...catalog.boards, ...catalog.items, ...catalog.offers,
    ...catalog.machines, ...catalog.recipe_templates,
  ].map((item: any) => item.id);
  issues.push(...duplicateIssues(ids, "content/catalog"));
  const knownItems = new Set([...catalog.components, ...catalog.boards, ...catalog.items].map((item: any) => item.id));
  for (const offer of catalog.offers) {
    if (!knownItems.has(offer.specification_id)) {
      issues.push({ path: offer.id, message: `unknown offer specification ${offer.specification_id}` });
    }
  }
  const templatesByStage = new Map<string, any>();
  const requiredTemplateSources: Record<string, string[]> = {
    assembly: ["design-compute-components", "design-memory-components", "design-io-components", "design-power-components", "substrate"],
    bonding: ["prior-wip", "connection-kits"],
    inspection: ["prior-wip"],
    test: ["prior-wip"],
    packaging: ["prior-wip", "selected-thermal-components", "packaging-material"],
  };
  const machinesByCapability = new Map<string, any[]>();
  for (const machine of catalog.machines) {
    for (const capability of machine.capabilities) {
      machinesByCapability.set(capability, [...(machinesByCapability.get(capability) ?? []), machine]);
    }
  }
  for (const template of catalog.recipe_templates) {
    if (templatesByStage.has(template.stage)) issues.push({ path: template.id, message: `duplicate stage template ${template.stage}` });
    templatesByStage.set(template.stage, template);
    const machines = machinesByCapability.get(template.capability) ?? [];
    if (!machines.length) issues.push({ path: template.id, message: `no machine supports ${template.capability}` });
    const bindings = [
      ...template.input_bindings,
      template.pass_output,
      ...(template.reject_output ? [template.reject_output] : []),
    ];
    for (const binding of bindings) {
      if (!machines.some((machine) => machine.ports.some((port: any) => port.id === binding.port_id))) {
        issues.push({ path: template.id, message: `unsupported port ${binding.port_id}` });
      }
      const actualSources = template.input_bindings.map((binding: any) => binding.source).sort();
      const expectedSources = requiredTemplateSources[template.stage]?.toSorted() ?? [];
      if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) {
        issues.push({ path: template.id, message: `stage input bindings must be exactly ${expectedSources.join(", ")}` });
      }
    }
    const seededStage = template.stage === "inspection" || template.stage === "test";
    if (seededStage !== (template.outcome_mode === "exactly_one_seeded" && Boolean(template.reject_output))) {
      issues.push({ path: template.id, message: "inspection/test must have exactly-one seeded pass/reject outcomes and other stages must be deterministic" });
    }
  }
  for (const stage of ["assembly", "bonding", "inspection", "test", "packaging"]) {
    if (!templatesByStage.has(stage)) issues.push({ path: "content/catalog/recipe_templates", message: `missing ${stage} template` });
  }
  if (!design || !manufacturingPlan || !factory || !compiledFixture) return;
  validateReferenceDesignGeometry(catalog, design, issues);

  const expectedBom = [
    ...design.components.map((entry: any) => ({ item_id: entry.item_id })),
    { item_id: design.board_selection.item_id },
    ...design.connections.map((entry: any) => ({ item_id: entry.technology_id })),
    design.packaging_material,
  ];
  for (const item of expectedBom) {
    if (!knownItems.has(item.item_id)) issues.push({ path: design.id, message: `unknown reference item ${item.item_id}` });
  }
  for (const entry of [...factory.fixed_entities, ...factory.player_built_machines]) {
    if (!catalog.machines.some((machine: any) => machine.id === entry.machine_id)) {
      issues.push({ path: factory.id, message: `unknown reference machine ${entry.machine_id}` });
    }
  }

  function validateReferenceDesignGeometry(catalog: any, design: any, issues: Issue[]): void {
    const board = catalog.boards.find((entry: any) => entry.id === design.board_selection.item_id);
    if (!board || !board.board_size) {
      issues.push({ path: design.id, message: `unknown board ${design.board_selection.item_id}` });
      return;
    }
    if (design.components.length > board.max_components) {
      issues.push({ path: design.id, message: `board component limit ${board.max_components} exceeded` });
    }
    const definitions = new Map(catalog.components.map((entry: any) => [entry.id, entry] as const));
    const footprints = new Map<string, { x: number; y: number; width: number; height: number; family: string }>();
    for (const instance of design.components) {
      const definition: any = definitions.get(instance.item_id);
      if (!definition) continue;
      const rotated = instance.rotation === 90 || instance.rotation === 270;
      const width = rotated ? definition.footprint.height : definition.footprint.width;
      const height = rotated ? definition.footprint.width : definition.footprint.height;
      const footprint = { ...instance.position, width, height, family: definition.family };
      footprints.set(instance.instance_id, footprint);
      if (footprint.x + width > board.board_size.width || footprint.y + height > board.board_size.height) {
        issues.push({ path: instance.instance_id, message: "component footprint exceeds selected board" });
      }
      if (definition.properties.must_touch_edge && !(
        footprint.x === 0 || footprint.y === 0 ||
        footprint.x + width === board.board_size.width ||
        footprint.y + height === board.board_size.height
      )) {
        issues.push({ path: instance.instance_id, message: "edge component does not touch selected board edge" });
      }
    }
    const instances = [...footprints.entries()];
    for (let left = 0; left < instances.length; left += 1) {
      for (let right = left + 1; right < instances.length; right += 1) {
        const [leftId, a] = instances[left]!;
        const [rightId, b] = instances[right]!;
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          issues.push({ path: design.id, message: `component footprints overlap: ${leftId}, ${rightId}` });
        }
      }
    }
    const inside = (cell: any, footprint: any) =>
      cell.x >= footprint.x && cell.x < footprint.x + footprint.width &&
      cell.y >= footprint.y && cell.y < footprint.y + footprint.height;
    const requiredPairs = new Set(["compute:memory", "io:memory", "compute:io"]);
    const actualPairs = new Set<string>();
    for (const connection of design.connections) {
      const from = footprints.get(connection.from_instance_id);
      const to = footprints.get(connection.to_instance_id);
      if (!from || !to) {
        issues.push({ path: connection.connection_id, message: "connection endpoint instance does not exist" });
        continue;
      }
      actualPairs.add([from.family, to.family].sort().join(":"));
      if (!inside(connection.route[0], from) || !inside(connection.route.at(-1), to)) {
        issues.push({ path: connection.connection_id, message: "route must begin and end inside its declared endpoint footprints" });
      }
      for (let index = 0; index < connection.route.length; index += 1) {
        const cell = connection.route[index];
        if (cell.x >= board.board_size.width || cell.y >= board.board_size.height) {
          issues.push({ path: connection.connection_id, message: "route exceeds selected board" });
        }
        if (index > 0) {
          const prior = connection.route[index - 1];
          if (Math.abs(cell.x - prior.x) + Math.abs(cell.y - prior.y) !== 1) {
            issues.push({ path: connection.connection_id, message: "route cells must be orthogonally contiguous" });
          }
        }
      }
    }
    for (const pair of requiredPairs) {
      if (!actualPairs.has(pair)) issues.push({ path: design.id, message: `missing required connection ${pair}` });
    }
    const compute = [...footprints.values()].filter((entry) => entry.family === "compute");
    const thermal = [...footprints.values()].filter((entry) => entry.family === "thermal");
    for (const chip of compute) {
      const adjacent = thermal.some((sink) =>
        chip.x + chip.width === sink.x || sink.x + sink.width === chip.x
          ? chip.y < sink.y + sink.height && chip.y + chip.height > sink.y
          : (chip.y + chip.height === sink.y || sink.y + sink.height === chip.y) &&
            chip.x < sink.x + sink.width && chip.x + chip.width > sink.x
      );
      if (!adjacent) issues.push({ path: design.id, message: "every compute instance requires an adjacent thermal instance" });
    }
  }

  try {
    validateManufacturingPlan(catalog, design, manufacturingPlan);
    if (manufacturingPlan.content_digest !== manufacturingPlanDigest(manufacturingPlan)) {
      issues.push({ path: manufacturingPlan.id, message: "manufacturing plan digest is stale" });
    }
    const derivedRecipes = compileDesignRecipes(catalog, design, manufacturingPlan);
    if (JSON.stringify(derivedRecipes) !== JSON.stringify(compiledFixture.recipes)) {
      issues.push({ path: "fixtures/reference/default-compiled-recipes.yaml", message: "stored compiled recipe fixture is stale" });
    }
    const derived = deriveReferenceBalance(catalog, design, manufacturingPlan, factory);
    const tolerances: Record<string, number> = {
      expected_yield: 0.0001,
      material_cost_per_attempt_usd: 0.000001,
      operating_cost_per_attempt_usd: 0.000001,
      expected_cost_per_accepted_usd: 0.01,
      expected_margin_percent: 0.01,
      recommended_attempts: 0,
      reference_factory_capital_usd: 0.000001,
      starting_cash_usd: 0,
    };
    for (const [field, tolerance] of Object.entries(tolerances)) {
      if (Math.abs(catalog.balance[field] - (derived as any)[field]) > tolerance) {
        issues.push({ path: `content/catalog/balance/${field}`, message: `expected ${(derived as any)[field]}, got ${catalog.balance[field]}` });
      }
    }
  } catch (error) {
    issues.push({ path: "content/catalog", message: error instanceof Error ? error.message : String(error) });
  }
}
