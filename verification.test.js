const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine.js");

function profile(name) {
  return E.calculateDesign(E.scenarioDesign(name));
}

test("Golden A: invalid performance is blocked and both documented remedies work", () => {
  const design = E.scenarioDesign("invalid");
  const invalid = E.calculateDesign(design);
  assert.equal(invalid.eligible, false);
  assert.match(invalid.diagnoses.join(" "), /move memory closer or use the express/i);

  const memory = design.parts.find((part) => part.id === "memory");
  memory.x = 2;
  memory.y = 0;
  assert.equal(E.calculateDesign(design).eligible, true);

  memory.x = 5;
  memory.y = 3;
  design.connections.find(
    (connection) => [connection.a, connection.b].sort().join(":") === "cpu:memory"
  ).type = "express";
  assert.equal(E.calculateDesign(design).eligible, true);
});

test("Golden B: lean design has approximately 96% yield, positive margin, and inspection bottleneck", () => {
  const lean = profile("lean");
  const rate = E.productionRate(lean, E.starterFactory());
  assert.equal(lean.eligible, true);
  assert.ok(Math.abs(lean.yieldRate - 0.96) < 0.005);
  assert.ok(lean.marginPerAccepted > 0);
  assert.equal(rate.bottleneck, "inspection");
  assert.ok(Math.abs(rate.acceptedPerMinute - 8.23) < 0.1);
});

test("Paper balance: performance-heavy reference remains the intentional losing strategy", () => {
  const heavy = profile("performance");
  const rate = E.productionRate(heavy, E.starterFactory());
  assert.equal(heavy.materialCost, 64);
  assert.ok(Math.abs(heavy.operatingCost - 27) < 0.1);
  assert.ok(Math.abs(heavy.yieldRate - 0.88) < 0.01);
  assert.ok(Math.abs(heavy.costPerAccepted - 103.41) < 0.5);
  assert.ok(heavy.marginPerAccepted < 0);
  assert.ok(Math.abs(rate.attemptsPerMinute - 5.45) < 0.1);
});

test("Golden C: heat-risk design creates more test rejects, garbage, and expected loss", () => {
  const lean = profile("lean");
  const hot = profile("hot");
  assert.equal(hot.eligible, true);
  assert.ok(hot.testReject > lean.testReject);
  assert.ok(hot.yieldRate < lean.yieldRate);
  assert.ok(hot.marginPerAccepted < lean.marginPerAccepted);
  const run = E.advanceProduction(hot, E.starterFactory(), E.initialProductionState(), 60);
  assert.ok(run.testRejects > 0);
  assert.ok(E.validateFactory(E.starterFactory()).errors.every((error) => !error.includes("Garbage")));
});

test("Golden D: crowded design loads process and inspection and lowers throughput", () => {
  const lean = profile("lean");
  const crowded = profile("crowded");
  const factory = E.starterFactory();
  assert.ok(crowded.cycles.process > lean.cycles.process);
  assert.ok(crowded.cycles.inspection > lean.cycles.inspection);
  assert.ok(E.productionRate(crowded, factory).acceptedPerMinute < E.productionRate(lean, factory).acceptedPerMinute);
});

test("Golden E: connected second scanner raises accepted rate and moves bottleneck", () => {
  const lean = profile("lean");
  const factory = E.starterFactory();
  const before = E.productionRate(lean, factory);
  factory.push(
    { type: "inspection", x: 5, y: 2 },
    { type: "track", x: 3, y: 2 },
    { type: "track", x: 4, y: 2 },
    { type: "track", x: 6, y: 2 }
  );
  const after = E.productionRate(lean, factory);
  assert.equal(E.validateFactory(factory).connectedInspections, 2);
  assert.equal(before.bottleneck, "inspection");
  assert.notEqual(after.bottleneck, "inspection");
  assert.ok(after.acceptedPerMinute > before.acceptedPerMinute);
});

test("Golden E: scanner expansion capital includes the specified machine and transport costs", () => {
  const expansion = [
    { type: "inspection", x: 5, y: 2, capitalCost: 12000 },
    { type: "track", x: 3, y: 2 },
    { type: "track", x: 4, y: 2 },
    { type: "track", x: 6, y: 2 },
  ];
  assert.equal(E.factoryCost(expansion), 12600);
});

test("Functional: board placement, I/O edge, required links, and express limit are enforced", () => {
  const overlap = E.defaultDesign();
  overlap.parts.find((part) => part.id === "memory").x = 1;
  overlap.parts.find((part) => part.id === "memory").y = 1;
  assert.match(E.calculateDesign(overlap).errors.join(" "), /overlaps/);

  const interiorIo = E.defaultDesign();
  interiorIo.parts.find((part) => part.id === "io").x = 4;
  interiorIo.parts.find((part) => part.id === "io").y = 2;
  assert.match(E.calculateDesign(interiorIo).errors.join(" "), /must touch a die edge/);

  const missing = E.defaultDesign();
  missing.connections.pop();
  assert.match(E.calculateDesign(missing).errors.join(" "), /Missing required/);

  const twoExpress = E.defaultDesign();
  twoExpress.connections[0].type = "express";
  twoExpress.connections[1].type = "express";
  assert.match(E.calculateDesign(twoExpress).errors.join(" "), /Only one express/);
});

test("Functional: factory reports exact missing equipment and routes", () => {
  const empty = E.validateFactory([]);
  assert.equal(empty.valid, false);
  assert.match(empty.errors[0], /Missing Design Kit Dock/);

  const broken = E.starterFactory().filter((item) => !(item.x === 3 && item.y === 3));
  assert.equal(E.validateFactory(broken).valid, false);
  assert.match(E.validateFactory(broken).errors.join(" "), /Process to Inspection/);

  const starter = E.validateFactory(E.starterFactory());
  assert.equal(starter.valid, true);
  assert.equal(starter.cost, 26000);
});

test("Functional: submitted design produces an explicit component kit", () => {
  const lean = profile("lean");
  assert.equal(lean.componentKit.name, "Efficient CPU controller kit");
  assert.equal(lean.componentKit.supplierCost, lean.materialCost);
  assert.deepEqual(
    lean.componentKit.items.map((item) => [item.catalogId, item.quantity]),
    [
      ["CP-110", 1],
      ["MD-110", 1],
      ["IO-110", 1],
      ["PM/TH-110", 1],
      ["DL-110", 3],
    ]
  );
});

test("Functional: connected memory fabrication replaces the purchased memory cost", () => {
  const lean = profile("lean");
  const purchased = E.factorySourcing(lean, E.starterFactory());
  assert.equal(purchased.memorySource, "supplier");
  assert.equal(purchased.materialCost, 38);

  const integratedFactory = E.starterFactory();
  integratedFactory.push(
    { type: "memoryFab", x: 0, y: 1 },
    { type: "track", x: 1, y: 1 },
    { type: "track", x: 2, y: 1 },
    { type: "track", x: 2, y: 2 }
  );
  const internal = E.factorySourcing(lean, integratedFactory);
  assert.equal(internal.memorySource, "internal");
  assert.equal(internal.supplierCost, 28);
  assert.equal(internal.internalComponentCost, 6);
  assert.equal(internal.materialCost, 34);
  assert.equal(internal.savingsPerAttempt, 4);

  const run = E.advanceProduction(lean, integratedFactory, E.initialProductionState(), 60);
  assert.ok(run.supplierCost > 0);
  assert.ok(run.internalComponentCost > 0);
  assert.ok(run.productionCost < E.advanceProduction(lean, E.starterFactory(), E.initialProductionState(), 60).productionCost);
});

test("Functional: production counts only accepted packages and reconciles economy", () => {
  const lean = profile("lean");
  const run = E.advanceProduction(lean, E.starterFactory(), E.initialProductionState(), 120);
  assert.ok(run.attempts > run.accepted);
  assert.ok(run.inspectedRejects + run.testRejects > 0);
  assert.equal(run.inputKits, 1200 - run.attempts);
  assert.ok(Math.abs(run.cash - (run.revenue - run.productionCost)) < 0.001);

  const complete = E.advanceProduction(lean, E.starterFactory(), E.initialProductionState(), 10000);
  assert.equal(complete.accepted, 1000);
  assert.equal(complete.complete, true);
  assert.ok(complete.attempts > 1000);
});
