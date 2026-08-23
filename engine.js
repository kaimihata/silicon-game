(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ChipCityEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BOARD_SIZE = 6;
  const FACTORY_WIDTH = 12;
  const FACTORY_HEIGHT = 8;
  const CONTRACT = Object.freeze({
    quantity: 1000,
    price: 100,
    responsiveness: 90,
    startingCash: 10000,
    borrowing: 16000,
  });

  const PARTS = Object.freeze({
    efficientCpu: {
      kind: "cpu", label: "Efficient CPU", catalogId: "CP-110", w: 2, h: 2, cost: 16, response: 72,
    },
    fastCpu: {
      kind: "cpu", label: "Fast CPU", catalogId: "CP-130", w: 2, h: 2, cost: 28, response: 90,
    },
    standardMemory: {
      kind: "memory", label: "Standard memory", catalogId: "MD-110", w: 1, h: 3, cost: 10, internalCost: 6, response: 20,
    },
    fastMemory: {
      kind: "memory", label: "Fast memory", catalogId: "MD-130", w: 1, h: 3, cost: 20, internalCost: 12, response: 28,
    },
    displayIo: {
      kind: "io", label: "Display I/O", catalogId: "IO-110", w: 1, h: 2, cost: 5, response: 0,
    },
    cooling: {
      kind: "cooling", label: "Cooling / power", catalogId: "PM/TH-110", w: 2, h: 1, cost: 4, response: 0,
    },
  });

  const FACTORY_ITEMS = Object.freeze({
    input: { label: "Design Kit Dock", cost: 1500 },
    process: { label: "Process", cost: 7000 },
    memoryFab: { label: "Memory Fabricator", cost: 9000 },
    inspection: { label: "Inspection", cost: 5000 },
    test: { label: "Test", cost: 4500 },
    packaging: { label: "Packaging", cost: 4000 },
    garbage: { label: "Garbage", cost: 500 },
    output: { label: "Output bay", cost: 1500 },
    track: { label: "Track", cost: 200 },
  });

  const REQUIRED_LINKS = Object.freeze([
    ["cpu", "memory"],
    ["cpu", "io"],
    ["io", "memory"],
  ]);

  const REQUIRED_ROUTES = Object.freeze([
    ["input", "process"],
    ["process", "inspection"],
    ["inspection", "test"],
    ["test", "packaging"],
    ["packaging", "output"],
    ["inspection", "garbage"],
    ["test", "garbage"],
  ]);

  const canonicalPair = (a, b) => [a, b].sort().join(":");
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const round = (value, digits = 2) => Number(value.toFixed(digits));

  function defaultDesign() {
    return {
      parts: [
        { id: "cpu", type: "efficientCpu", x: 1, y: 1 },
        { id: "memory", type: "standardMemory", x: 3, y: 1 },
        { id: "io", type: "displayIo", x: 5, y: 2 },
        { id: "cooling", type: "cooling", x: 1, y: 3 },
      ],
      connections: [
        { a: "cpu", b: "memory", type: "standard" },
        { a: "cpu", b: "io", type: "standard" },
        { a: "io", b: "memory", type: "standard" },
      ],
      routing: "clear",
    };
  }

  function scenarioDesign(name) {
    const design = defaultDesign();
    if (name === "invalid") {
      design.parts.find((part) => part.id === "cpu").x = 0;
      design.parts.find((part) => part.id === "cpu").y = 0;
      design.parts.find((part) => part.id === "memory").x = 5;
      design.parts.find((part) => part.id === "memory").y = 3;
      design.parts.find((part) => part.id === "io").x = 0;
      design.parts.find((part) => part.id === "io").y = 4;
      design.parts.find((part) => part.id === "cooling").x = 0;
      design.parts.find((part) => part.id === "cooling").y = 2;
    } else if (name === "hot") {
      design.parts = design.parts.filter((part) => part.id !== "cooling");
      design.parts.find((part) => part.id === "cpu").type = "fastCpu";
      design.parts.find((part) => part.id === "memory").type = "fastMemory";
    } else if (name === "performance") {
      design.parts.find((part) => part.id === "cpu").type = "fastCpu";
      design.parts.find((part) => part.id === "memory").type = "fastMemory";
      design.connections.find(
        (connection) => canonicalPair(connection.a, connection.b) === canonicalPair("cpu", "memory")
      ).type = "express";
    } else if (name === "crowded") {
      design.routing = "crowded";
    }
    return design;
  }

  function partDefinition(part) {
    return PARTS[part.type];
  }

  function occupiedCells(part) {
    const definition = partDefinition(part);
    const cells = [];
    if (!definition) return cells;
    for (let y = part.y; y < part.y + definition.h; y += 1) {
      for (let x = part.x; x < part.x + definition.w; x += 1) cells.push({ x, y });
    }
    return cells;
  }

  function rectDistance(a, b) {
    const ad = partDefinition(a);
    const bd = partDefinition(b);
    const ax = a.x + ad.w / 2;
    const ay = a.y + ad.h / 2;
    const bx = b.x + bd.w / 2;
    const by = b.y + bd.h / 2;
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function rectanglesTouch(a, b) {
    const ac = occupiedCells(a);
    const bc = occupiedCells(b);
    return ac.some((one) =>
      bc.some((two) => Math.abs(one.x - two.x) + Math.abs(one.y - two.y) === 1)
    );
  }

  function calculateDesign(design) {
    const errors = [];
    const diagnoses = [];
    const partsByKind = {};

    for (const part of design.parts) {
      const definition = partDefinition(part);
      if (!definition) {
        errors.push(`Unknown part type: ${part.type}.`);
        continue;
      }
      if (partsByKind[definition.kind]) errors.push(`Only one ${definition.kind} may be placed.`);
      partsByKind[definition.kind] = part;
      if (
        part.x < 0 ||
        part.y < 0 ||
        part.x + definition.w > BOARD_SIZE ||
        part.y + definition.h > BOARD_SIZE
      ) {
        errors.push(`${definition.label} is outside the 6x6 die.`);
      }
      if (
        definition.kind === "io" &&
        part.x > 0 &&
        part.y > 0 &&
        part.x + definition.w < BOARD_SIZE &&
        part.y + definition.h < BOARD_SIZE
      ) {
        errors.push("Display I/O must touch a die edge.");
      }
    }

    for (let i = 0; i < design.parts.length; i += 1) {
      for (let j = i + 1; j < design.parts.length; j += 1) {
        const first = design.parts[i];
        const second = design.parts[j];
        const secondCells = new Set(occupiedCells(second).map((cell) => `${cell.x}:${cell.y}`));
        if (occupiedCells(first).some((cell) => secondCells.has(`${cell.x}:${cell.y}`))) {
          errors.push(`${partDefinition(first).label} overlaps ${partDefinition(second).label}.`);
        }
      }
    }

    for (const required of ["cpu", "memory", "io"]) {
      if (!partsByKind[required]) errors.push(`A ${required} part is required.`);
    }

    const connections = new Map();
    let expressCount = 0;
    for (const connection of design.connections) {
      const first = design.parts.find((part) => part.id === connection.a);
      const second = design.parts.find((part) => part.id === connection.b);
      if (!first || !second || first.id === second.id) {
        errors.push("A connection has a missing or identical endpoint.");
        continue;
      }
      const pair = canonicalPair(partDefinition(first).kind, partDefinition(second).kind);
      connections.set(pair, connection);
      if (connection.type === "express") expressCount += 1;
    }
    if (expressCount > 1) errors.push("Only one express connection is allowed.");
    for (const [a, b] of REQUIRED_LINKS) {
      if (!connections.has(canonicalPair(a, b))) errors.push(`Missing required ${a}-${b} connection.`);
    }

    const cpu = partsByKind.cpu;
    const memory = partsByKind.memory;
    const cooling = partsByKind.cooling;
    const cpuDefinition = cpu ? partDefinition(cpu) : PARTS.efficientCpu;
    const memoryDefinition = memory ? partDefinition(memory) : PARTS.standardMemory;
    const distance = cpu && memory ? rectDistance(cpu, memory) : 10;
    const cpuMemory = connections.get(canonicalPair("cpu", "memory"));
    const expressBonus = cpuMemory && cpuMemory.type === "express" ? 48 : 0;
    const responsiveness = round(
      cpuDefinition.response + memoryDefinition.response - Math.max(0, distance - 2) * 8 + expressBonus,
      1
    );

    let heat = cpuDefinition.kind === "cpu" && cpu && cpu.type === "fastCpu" ? 40 : 18;
    if (cooling && cpu) heat -= rectanglesTouch(cooling, cpu) ? 16 : 8;
    heat = Math.max(2, heat);

    const crowded = design.routing === "crowded";
    const isFastCpu = cpu && cpu.type === "fastCpu";
    const isFastMemory = memory && memory.type === "fastMemory";
    const inspectionReject = clamp(0.01 + (crowded ? 0.04 : 0) + (isFastCpu ? 0.03 : 0), 0, 0.35);
    const testReject = clamp(0.03 + Math.max(0, heat - 10) * 0.003 + (isFastMemory ? 0.01 : 0), 0, 0.4);
    const yieldRate = (1 - inspectionReject) * (1 - testReject);

    const materialCost =
      design.parts.reduce((total, part) => total + (partDefinition(part)?.cost || 0), 0) +
      design.connections.reduce((total, connection) => total + (connection.type === "express" ? 5 : 1), 0);
    const kitItems = design.parts.map((part) => {
      const definition = partDefinition(part);
      return {
        id: part.id,
        type: part.type,
        label: definition?.label || part.type,
        catalogId: definition?.catalogId || "",
        quantity: 1,
        supplierCost: definition?.cost || 0,
        internalCost: definition?.internalCost,
      };
    });
    const standardLinks = design.connections.filter((connection) => connection.type !== "express").length;
    const wideLinks = design.connections.filter((connection) => connection.type === "express").length;
    if (standardLinks) {
      kitItems.push({
        id: "standard-links",
        type: "standardConnection",
        label: "Standard connection kit",
        catalogId: "DL-110",
        quantity: standardLinks,
        supplierCost: standardLinks,
      });
    }
    if (wideLinks) {
      kitItems.push({
        id: "wide-links",
        type: "wideConnection",
        label: "Wide connection kit",
        catalogId: "DL-130",
        quantity: wideLinks,
        supplierCost: wideLinks * 5,
      });
    }
    const operatingCost =
      20 + (isFastCpu ? 4 : 0) + (isFastMemory ? 2 : 0) + (crowded ? 4 : 0) + Math.max(0, heat - 20) * 0.25;
    const processSeconds = 5 + (crowded ? 4 : 0) + (isFastCpu ? 1 : 0);
    const inspectionSeconds = 7 + (crowded ? 4 : 0) + (isFastCpu ? 4 : 0);
    const testSeconds = 5 + Math.max(0, heat - 10) * 0.12 + (isFastMemory ? 0.5 : 0);
    const packagingSeconds = 4;
    const costPerAccepted = (materialCost + operatingCost) / yieldRate;
    const marginPerAccepted = CONTRACT.price - costPerAccepted;

    if (responsiveness < CONTRACT.responsiveness) {
      diagnoses.push(
        `Responsiveness ${responsiveness} is below ${CONTRACT.responsiveness}; move memory closer or use the express CPU-memory link.`
      );
    }
    if (heat >= 30) diagnoses.push("High heat increases test time and sends more paid units to garbage.");
    if (crowded) diagnoses.push("Shared routing raises process and inspection cycle times.");
    if (marginPerAccepted < 0) diagnoses.push("Expected cost per accepted chip exceeds contract revenue.");
    if (!diagnoses.length) diagnoses.push("Lean profile: eligible, positive margin, and inspection is the initial bottleneck.");

    return {
      errors,
      diagnoses,
      eligible: errors.length === 0 && responsiveness >= CONTRACT.responsiveness,
      responsiveness,
      distance: round(distance, 1),
      heat: round(heat, 1),
      materialCost: round(materialCost),
      operatingCost: round(operatingCost),
      inspectionReject: round(inspectionReject, 4),
      testReject: round(testReject, 4),
      yieldRate: round(yieldRate, 4),
      wasteRate: round(1 - yieldRate, 4),
      costPerAccepted: round(costPerAccepted),
      marginPerAccepted: round(marginPerAccepted),
      contractResult: round(marginPerAccepted * CONTRACT.quantity),
      componentKit: {
        name: `${cpuDefinition.label} controller kit`,
        items: kitItems,
        supplierCost: round(materialCost),
        memory: memory
          ? {
              type: memory.type,
              label: memoryDefinition.label,
              supplierCost: memoryDefinition.cost,
              internalCost: memoryDefinition.internalCost,
            }
          : null,
      },
      cycles: {
        process: round(processSeconds, 2),
        inspection: round(inspectionSeconds, 2),
        test: round(testSeconds, 2),
        packaging: packagingSeconds,
      },
    };
  }

  function starterFactory() {
    return [
      { type: "input", x: 0, y: 3 },
      { type: "process", x: 2, y: 3 },
      { type: "inspection", x: 4, y: 3 },
      { type: "test", x: 6, y: 3 },
      { type: "packaging", x: 8, y: 3 },
      { type: "output", x: 10, y: 3 },
      { type: "garbage", x: 5, y: 5 },
      { type: "track", x: 1, y: 3 },
      { type: "track", x: 3, y: 3 },
      { type: "track", x: 5, y: 3 },
      { type: "track", x: 7, y: 3 },
      { type: "track", x: 9, y: 3 },
      { type: "track", x: 4, y: 4 },
      { type: "track", x: 4, y: 5 },
      { type: "track", x: 5, y: 4 },
      { type: "track", x: 6, y: 4 },
      { type: "track", x: 6, y: 5 },
    ];
  }

  function factoryCost(items) {
    return items.reduce(
      (total, item) => total + (item.capitalCost ?? FACTORY_ITEMS[item.type]?.cost ?? 0),
      0
    );
  }

  function adjacent(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  }

  function hasTrackPath(items, source, target) {
    const traversable = items.filter(
      (item) => item.type === "track" || item === source || item === target
    );
    const open = [source];
    const visited = new Set([`${source.x}:${source.y}`]);
    while (open.length) {
      const current = open.shift();
      if (current === target) return true;
      for (const candidate of traversable) {
        const key = `${candidate.x}:${candidate.y}`;
        if (!visited.has(key) && adjacent(current, candidate)) {
          visited.add(key);
          open.push(candidate);
        }
      }
    }
    return false;
  }

  function routeExists(items, fromType, toType) {
    const sources = items.filter((item) => item.type === fromType);
    const targets = items.filter((item) => item.type === toType);
    return sources.some((source) => targets.some((target) => hasTrackPath(items, source, target)));
  }

  function connectedInspectionCount(items) {
    const processes = items.filter((item) => item.type === "process");
    const tests = items.filter((item) => item.type === "test");
    return items.filter(
      (inspection) =>
        inspection.type === "inspection" &&
        processes.some((process) => hasTrackPath(items, process, inspection)) &&
        tests.some((test) => hasTrackPath(items, inspection, test))
    ).length;
  }

  function connectedMemoryFabricatorCount(items) {
    const processes = items.filter((item) => item.type === "process");
    return items.filter(
      (fabricator) =>
        fabricator.type === "memoryFab" &&
        processes.some((process) => hasTrackPath(items, fabricator, process))
    ).length;
  }

  function factorySourcing(profile, items) {
    const memory = profile.componentKit?.memory;
    const internalMemory = Boolean(memory && connectedMemoryFabricatorCount(items));
    const supplierCost = profile.materialCost - (internalMemory ? memory.supplierCost : 0);
    const internalComponentCost = internalMemory ? memory.internalCost : 0;
    return {
      memorySource: internalMemory ? "internal" : "supplier",
      supplierCost: round(supplierCost),
      internalComponentCost: round(internalComponentCost),
      materialCost: round(supplierCost + internalComponentCost),
      savingsPerAttempt: round(profile.materialCost - supplierCost - internalComponentCost),
    };
  }

  function validateFactory(items) {
    const errors = [];
    for (const type of ["input", "process", "inspection", "test", "packaging", "garbage", "output"]) {
      if (!items.some((item) => item.type === type)) {
        errors.push(`Missing ${FACTORY_ITEMS[type].label}.`);
      }
    }
    for (const [from, to] of REQUIRED_ROUTES) {
      if (
        items.some((item) => item.type === from) &&
        items.some((item) => item.type === to) &&
        !routeExists(items, from, to)
      ) {
        errors.push(`Missing transport route: ${FACTORY_ITEMS[from].label} to ${FACTORY_ITEMS[to].label}.`);
      }
    }
    return {
      valid: errors.length === 0,
      errors,
      connectedInspections: connectedInspectionCount(items),
      connectedMemoryFabricators: connectedMemoryFabricatorCount(items),
      cost: factoryCost(items),
    };
  }

  function productionRate(profile, factoryItems) {
    const inspections = Math.max(1, connectedInspectionCount(factoryItems));
    const effective = {
      process: profile.cycles.process,
      inspection: profile.cycles.inspection / inspections,
      test: profile.cycles.test,
      packaging: profile.cycles.packaging,
    };
    const bottleneck = Object.entries(effective).sort((a, b) => b[1] - a[1])[0];
    return {
      bottleneck: bottleneck[0],
      attemptsPerMinute: round(60 / bottleneck[1], 3),
      acceptedPerMinute: round((60 / bottleneck[1]) * profile.yieldRate, 3),
      effectiveCycles: effective,
    };
  }

  function initialProductionState(cash = 0) {
    return {
      elapsedSeconds: 0,
      inputKits: 1200,
      attempts: 0,
      inspectedRejects: 0,
      testRejects: 0,
      accepted: 0,
      revenue: 0,
      productionCost: 0,
      supplierCost: 0,
      internalComponentCost: 0,
      operatingCost: 0,
      cash,
      complete: false,
    };
  }

  function advanceProduction(profile, factoryItems, state, realSeconds, speed = 1) {
    if (!profile.eligible) throw new Error("The chip design is not eligible for production.");
    const validation = validateFactory(factoryItems);
    if (!validation.valid) throw new Error(`The factory is invalid: ${validation.errors[0]}`);
    const rate = productionRate(profile, factoryItems);
    const requestedAttempts = (rate.attemptsPerMinute / 60) * realSeconds * speed;
    const remainingAccepted = Math.max(0, CONTRACT.quantity - state.accepted);
    const attemptsForContract = remainingAccepted / profile.yieldRate;
    const attempts = Math.min(requestedAttempts, state.inputKits, attemptsForContract);
    const inspectionRejects = attempts * profile.inspectionReject;
    const testRejects = (attempts - inspectionRejects) * profile.testReject;
    const accepted = attempts - inspectionRejects - testRejects;
    const revenue = accepted * CONTRACT.price;
    const sourcing = factorySourcing(profile, factoryItems);
    const supplierCost = attempts * sourcing.supplierCost;
    const internalComponentCost = attempts * sourcing.internalComponentCost;
    const operatingCost = attempts * profile.operatingCost;
    const cost = supplierCost + internalComponentCost + operatingCost;
    const acceptedTotal = state.accepted + accepted;
    const complete = acceptedTotal >= CONTRACT.quantity - 0.0001;
    return {
      elapsedSeconds: state.elapsedSeconds + realSeconds * speed,
      inputKits: state.inputKits - attempts,
      attempts: state.attempts + attempts,
      inspectedRejects: state.inspectedRejects + inspectionRejects,
      testRejects: state.testRejects + testRejects,
      accepted: complete ? CONTRACT.quantity : acceptedTotal,
      revenue: state.revenue + revenue,
      productionCost: state.productionCost + cost,
      supplierCost: (state.supplierCost || 0) + supplierCost,
      internalComponentCost: (state.internalComponentCost || 0) + internalComponentCost,
      operatingCost: (state.operatingCost || 0) + operatingCost,
      cash: state.cash + revenue - cost,
      complete,
    };
  }

  return {
    BOARD_SIZE,
    FACTORY_WIDTH,
    FACTORY_HEIGHT,
    CONTRACT,
    PARTS,
    FACTORY_ITEMS,
    REQUIRED_LINKS,
    defaultDesign,
    scenarioDesign,
    occupiedCells,
    calculateDesign,
    starterFactory,
    factoryCost,
    factorySourcing,
    validateFactory,
    productionRate,
    initialProductionState,
    advanceProduction,
  };
});
