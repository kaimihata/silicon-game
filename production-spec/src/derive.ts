import { digest } from "./canonical.js";

export type Quantity = { item_id: string; quantity: number };

type PortQuantity = Quantity & { port_id: string };

export type CompiledRecipe = {
  id: string;
  stage: "assembly" | "bonding" | "inspection" | "test" | "packaging";
  design_revision_id: string;
  manufacturing_plan_id: string;
  inputs: PortQuantity[];
  pass_output: PortQuantity;
  reject_output?: PortQuantity;
  outcome_mode: "deterministic" | "exactly_one_seeded";
  workload: number;
  cycle_seconds: number;
  operating_cost_usd: number;
};

export type DerivedBalance = {
  expected_yield: number;
  material_cost_per_attempt_usd: number;
  operating_cost_per_attempt_usd: number;
  expected_cost_per_accepted_usd: number;
  expected_margin_percent: number;
  recommended_attempts: number;
  reference_factory_capital_usd: number;
  starting_cash_usd: number;
  incoming_defect_exposure: number;
  inspection_workload: number;
  test_workload: number;
};

function groupedQuantities(ids: string[]): Quantity[] {
  const quantities = new Map<string, number>();
  for (const itemId of ids) quantities.set(itemId, (quantities.get(itemId) ?? 0) + 1);
  return [...quantities].sort(([first], [second]) => first.localeCompare(second))
    .map(([item_id, quantity]) => ({ item_id, quantity }));
}

export function designBom(design: any): Quantity[] {
  return [
    ...groupedQuantities(design.components.map((entry: any) => entry.item_id)),
    { item_id: design.board_selection.item_id, quantity: 1 },
    ...groupedQuantities(design.connections.map((entry: any) => entry.technology_id)),
    design.packaging_material,
  ].sort((first, second) => first.item_id.localeCompare(second.item_id));
}

function offerDigest(offer: any): string {
  return digest({
    id: offer.id,
    specification_id: offer.specification_id,
    supplier: offer.supplier,
    quality: offer.quality,
    unit_price_usd: offer.unit_price_usd,
    defect_probability: offer.defect_probability,
  });
}

export function offerCatalogDigest(catalog: any): string {
  return digest(catalog.offers.map((offer: any) => ({
    id: offer.id,
    specification_id: offer.specification_id,
    supplier: offer.supplier,
    quality: offer.quality,
    unit_price_usd: offer.unit_price_usd,
    defect_probability: offer.defect_probability,
  })).sort((first: any, second: any) => first.id.localeCompare(second.id)));
}

export function manufacturingPlanDigest(plan: any): string {
  const canonical = structuredClone(plan);
  delete canonical.content_digest;
  return digest(canonical);
}

export function validateManufacturingPlan(catalog: any, design: any, plan: any): void {
  if (plan.immutable !== true) throw new Error("Manufacturing plan must be immutable");
  if (plan.design_revision_id !== revisionIdentity(design)) {
    throw new Error(`Manufacturing plan targets ${plan.design_revision_id}, expected ${revisionIdentity(design)}`);
  }
  if (plan.content_digest !== manufacturingPlanDigest(plan)) {
    throw new Error("Manufacturing plan content digest is stale");
  }
  if (plan.source_offer_catalog_digest !== offerCatalogDigest(catalog)) {
    throw new Error("Manufacturing plan source offer catalog is stale");
  }
  const qualityRank = new Map<string, number>(
    catalog.quality_tiers.map((tier: any) => [tier.id, tier.rank]),
  );
  const minimumQuality = new Map<string, string>(
    design.minimum_quality.map((entry: any) => [entry.item_id, entry.quality]),
  );
  const expected = new Map(designBom(design).map((entry) => [
    entry.item_id,
    entry.quantity * plan.attempt_capacity,
  ]));
  const allocated = new Map<string, number>();
  const lotIds = new Set<string>();
  const allocationKeys = new Set<string>();
  for (const allocation of plan.lot_allocations) {
    const offer = catalog.offers.find((candidate: any) => candidate.id === allocation.offer_id);
    if (!offer || offer.specification_id !== allocation.item_id) {
      throw new Error(`Allocation ${allocation.lot_id} references incompatible offer ${allocation.offer_id}`);
    }
    if (allocation.offer_digest !== offerDigest(offer) ||
        allocation.supplier !== offer.supplier ||
        allocation.quality !== offer.quality ||
        allocation.unit_cost_microusd !== Math.round(offer.unit_price_usd * 1_000_000) ||
        allocation.defect_probability_ppm !== Math.round(offer.defect_probability * 1_000_000)) {
      throw new Error(`Allocation ${allocation.lot_id} offer snapshot is stale`);
    }
    const minimum = minimumQuality.get(allocation.item_id);
    const allocationRank = qualityRank.get(allocation.quality);
    const minimumRank = minimum ? qualityRank.get(minimum) : undefined;
    if (allocationRank === undefined || minimumRank === undefined || allocationRank < minimumRank) {
      throw new Error(`Allocation ${allocation.lot_id} is below minimum quality`);
    }
    if (lotIds.has(allocation.lot_id)) throw new Error(`Duplicate lot ${allocation.lot_id}`);
    lotIds.add(allocation.lot_id);
    const key = `${allocation.item_id}:${allocation.allocation_index}`;
    if (allocationKeys.has(key)) throw new Error(`Duplicate allocation index ${key}`);
    allocationKeys.add(key);
    allocated.set(allocation.item_id, (allocated.get(allocation.item_id) ?? 0) + allocation.allocated_units);
  }
  for (const [itemId, quantity] of expected) {
    if (allocated.get(itemId) !== quantity) {
      throw new Error(`Manufacturing plan allocates ${allocated.get(itemId) ?? 0} ${itemId}; expected ${quantity}`);
    }
  }
  for (const itemId of allocated.keys()) {
    if (!expected.has(itemId)) throw new Error(`Manufacturing plan allocates non-BOM item ${itemId}`);
  }
}

function allocationsByItem(plan: any): Map<string, any[]> {
  const result = new Map<string, any[]>();
  for (const allocation of plan.lot_allocations) {
    result.set(allocation.item_id, [...(result.get(allocation.item_id) ?? []), allocation]);
  }
  return result;
}

function weightedAllocationValue(plan: any, itemId: string, field: string): number {
  const allocations = allocationsByItem(plan).get(itemId) ?? [];
  const total = allocations.reduce((sum, allocation) => sum + allocation.allocated_units, 0);
  if (!total) throw new Error(`Manufacturing plan has no allocation for ${itemId}`);
  return allocations.reduce((sum, allocation) =>
    sum + allocation.allocated_units * allocation[field], 0) / total;
}

function revisionIdentity(design: any): string {
  return `${design.design_id}-r${design.revision}`;
}

function workFor(
  catalog: any,
  design: any,
  plan: any,
  stage: "placement" | "bonding" | "inspection" | "test" | "packaging",
  qualityAdjusted: boolean,
): number {
  const tiers = new Map(catalog.quality_tiers.map((tier: any) => [tier.id, tier]));
  let total = 0;
  const entries = [
    ...groupedQuantities(design.components.map((entry: any) => entry.item_id)),
    { item_id: design.board_selection.item_id, quantity: 1 },
    ...groupedQuantities(design.connections.map((entry: any) => entry.technology_id)),
  ];
  const partById = new Map(
    [...catalog.components, ...catalog.boards].map((component: any) => [component.id, component]),
  );
  for (const entry of entries as Quantity[]) {
    if (stage === "placement" && entry.item_id.startsWith("th-")) continue;
    const component = partById.get(entry.item_id);
    if (!component) continue;
    let value = component.work[stage] * entry.quantity;
    if (qualityAdjusted && (stage === "inspection" || stage === "test")) {
      const allocations = allocationsByItem(plan).get(entry.item_id) ?? [];
      const totalUnits = allocations.reduce((sum, allocation) => sum + allocation.allocated_units, 0);
      value *= allocations.reduce((sum, allocation) => {
        const tier: any = tiers.get(allocation.quality);
        return sum + allocation.allocated_units * tier[`${stage}_work_multiplier`];
      }, 0) / totalUnits;
    }
    total += value;
  }
  return total;
}

function portInputs(catalog: any, design: any, template: any, priorWip?: string): PortQuantity[] {
  const stage = template.stage;
  const componentById = new Map<string, any>(
    catalog.components.map((component: any) => [component.id, component]),
  );
  const portFor = (source: string): string => {
    const binding = template.input_bindings.find((candidate: any) => candidate.source === source);
    if (!binding) throw new Error(`${template.id} has no ${source} binding`);
    return binding.port_id;
  };
  if (stage === "assembly") {
    const assembly = groupedQuantities(design.components
      .filter((entry: any) => componentById.get(entry.item_id)?.family !== "thermal")
      .map((entry: any) => entry.item_id));
    return [
      ...assembly.map((entry: Quantity) => {
        const family = componentById.get(entry.item_id)?.family;
        return { ...entry, port_id: portFor(`design-${family}-components`) };
      }),
      { item_id: design.board_selection.item_id, quantity: 1, port_id: portFor("substrate") },
    ];
  }
  if (stage === "bonding") {
    return [
      { item_id: priorWip!, quantity: 1, port_id: portFor("prior-wip") },
      ...groupedQuantities(design.connections.map((entry: any) => entry.technology_id))
        .map((entry: Quantity) => ({ ...entry, port_id: portFor("connection-kits") })),
    ];
  }
  if (stage === "inspection" || stage === "test") {
    return [{ item_id: priorWip!, quantity: 1, port_id: portFor("prior-wip") }];
  }
  const thermal = groupedQuantities(design.components
    .filter((entry: any) => componentById.get(entry.item_id)?.family === "thermal")
    .map((entry: any) => entry.item_id));
  return [
    { item_id: priorWip!, quantity: 1, port_id: portFor("prior-wip") },
    ...thermal.map((entry: Quantity) => ({ ...entry, port_id: portFor("selected-thermal-components") })),
    { ...design.packaging_material, port_id: portFor("packaging-material") },
  ];
}

function roundFixed(value: number, places = 6): number {
  const scale = 10 ** places;
  return roundHalfAway(value * scale) / scale;
}

function roundHalfAway(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export function compileDesignRecipes(catalog: any, design: any, plan: any): CompiledRecipe[] {
  if (design.published !== true) throw new Error("Recipes may compile only from an immutable published design revision");
  const componentById = new Map<string, any>(
    catalog.components.map((component: any) => [component.id, component]),
  );
  const modelsByFamily = new Map<string, Set<string>>();
  for (const entry of design.components as any[]) {
    const family = componentById.get(entry.item_id)?.family;
    if (!family || family === "substrate") continue;
    const models = modelsByFamily.get(family) ?? new Set<string>();
    models.add(entry.item_id);
    modelsByFamily.set(family, models);
  }
  for (const [family, models] of modelsByFamily) {
    if (models.size > 1) {
      throw new Error(
        `Starter recipe ports support one exact ${family} model per design; found ${[...models].join(", ")}`
      );
    }
  }
  validateManufacturingPlan(catalog, design, plan);
  const identity = revisionIdentity(design);
  const outputIds: Record<string, string> = {
    assembly: `wip-unconnected-${identity}`,
    bonding: `wip-bonded-${identity}`,
    inspection: `wip-inspected-${identity}`,
    test: `wip-validated-${identity}`,
    packaging: `${design.product_base_id}-${identity}`,
  };
  const workStage: Record<string, "placement" | "bonding" | "inspection" | "test" | "packaging"> = {
    assembly: "placement",
    bonding: "bonding",
    inspection: "inspection",
    test: "test",
    packaging: "packaging",
  };
  let priorWip: string | undefined;
  return catalog.recipe_templates.map((template: any) => {
    const stageWork = workStage[template.stage];
    const outputId = outputIds[template.stage];
    if (!stageWork || !outputId) throw new Error(`Unknown recipe template stage ${template.stage}`);
    const workload = workFor(
      catalog,
      design,
      plan,
      stageWork,
      template.stage === "inspection" || template.stage === "test",
    ) + template.fixed_work;
    const passOutput = {
      item_id: outputId,
      quantity: 1,
      port_id: template.pass_output.port_id,
    };
    const recipe: CompiledRecipe = {
      id: `${template.stage}-${identity}`,
      stage: template.stage,
      design_revision_id: identity,
      manufacturing_plan_id: plan.id,
      inputs: portInputs(catalog, design, template, priorWip),
      pass_output: passOutput,
      ...(template.reject_output ? {
        reject_output: {
          item_id: `${template.reject_output.kind}-${identity}`,
          quantity: 1,
          port_id: template.reject_output.port_id,
        },
      } : {}),
      outcome_mode: template.outcome_mode,
      workload: roundFixed(workload),
      cycle_seconds: roundFixed(template.setup_seconds + workload / template.work_capacity_per_second),
      operating_cost_usd: template.operating_cost_usd,
    };
    priorWip = passOutput.item_id;
    return recipe;
  });
}

export function deriveReferenceBalance(catalog: any, design: any, plan: any, factory: any): DerivedBalance {
  validateManufacturingPlan(catalog, design, plan);
  const materialCostMicrousd = roundHalfAway(plan.lot_allocations.reduce((sum: number, allocation: any) =>
    sum + allocation.unit_cost_microusd * allocation.allocated_units, 0) / plan.attempt_capacity);
  const materialCost = materialCostMicrousd / 1_000_000;
  let incomingDefectExposurePpm = 0;
  for (const entry of designBom(design)) {
    incomingDefectExposurePpm += weightedAllocationValue(
      plan,
      entry.item_id,
      "defect_probability_ppm",
    ) * entry.quantity;
  }
  incomingDefectExposurePpm = roundHalfAway(incomingDefectExposurePpm);
  const incomingDefectExposure = incomingDefectExposurePpm / 1_000_000;
  const recipes = compileDesignRecipes(catalog, design, plan);
  const inspectionWorkload = recipes.find((recipe) => recipe.stage === "inspection")!.workload;
  const testWorkload = recipes.find((recipe) => recipe.stage === "test")!.workload;
  const inspectionRejectPpm = Math.min(250_000, Math.max(
    0,
    roundHalfAway(6_000 + inspectionWorkload * 1_500 + incomingDefectExposurePpm * 0.5),
  ));
  const testRejectPpm = Math.min(300_000, Math.max(
    0,
    roundHalfAway(10_000 + testWorkload * 1_500 + incomingDefectExposurePpm * 0.5),
  ));
  const expectedYieldPpm = roundHalfAway(
    (1_000_000 - inspectionRejectPpm) * (1_000_000 - testRejectPpm) / 1_000_000,
  );
  const expectedYield = expectedYieldPpm / 1_000_000;
  const operatingCost = recipes.reduce((sum, recipe) => sum + recipe.operating_cost_usd, 0);
  const expectedCostMicrousd = roundHalfAway(
    (materialCostMicrousd + operatingCost * 1_000_000) * 1_000_000 / expectedYieldPpm,
  );
  const expectedCost = expectedCostMicrousd / 1_000_000;
  const expectedMargin = roundFixed((catalog.contract.unit_price_usd - expectedCost) /
    catalog.contract.unit_price_usd * 100);
  const recommendedAttempts = Math.ceil(catalog.contract.quantity * 1_000_000 / expectedYieldPpm * 1.05);
  const machineById = new Map(catalog.machines.map((machine: any) => [machine.id, machine]));
  const machineCapital = factory.player_built_machines.reduce((sum: number, entry: any) => {
    const machine: any = machineById.get(entry.machine_id);
    if (!machine) throw new Error(`Reference factory uses unknown machine ${entry.machine_id}`);
    return sum + machine.capital_cost_usd * entry.quantity;
  }, 0);
  const belt: any = machineById.get("log-100");
  const referenceCapital = machineCapital + belt.capital_cost_usd * factory.belt_cell_count;
  const startingCash = Math.ceil((recommendedAttempts * materialCost + referenceCapital) * 1.15);
  return {
    expected_yield: expectedYield,
    material_cost_per_attempt_usd: materialCost,
    operating_cost_per_attempt_usd: operatingCost,
    expected_cost_per_accepted_usd: expectedCost,
    expected_margin_percent: expectedMargin,
    recommended_attempts: recommendedAttempts,
    reference_factory_capital_usd: referenceCapital,
    starting_cash_usd: startingCash,
    incoming_defect_exposure: incomingDefectExposure,
    inspection_workload: inspectionWorkload,
    test_workload: testWorkload,
  };
}
