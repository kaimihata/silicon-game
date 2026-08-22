(function () {
  "use strict";

  const E = window.ChipCityEngine;
  let design = E.defaultDesign();
  let profile = E.calculateDesign(design);
  let submittedProfile = null;
  let selectedPart = null;
  let selectedEndpoint = null;
  let factoryTool = "track";
  let factory = [];
  let cash = E.CONTRACT.startingCash;
  let borrowed = false;
  let production = E.initialProductionState(0);
  let running = false;
  let timer = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const money = (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  const number = (value, digits = 0) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
  const percent = (value) => `${(value * 100).toFixed(1)}%`;

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    window.setTimeout(() => element.classList.remove("show"), 2600);
  }

  function setList(element, values) {
    element.innerHTML = values.length ? `<ul>${values.map((value) => `<li>${value}</li>`).join("")}</ul>` : "";
  }

  function setMetrics(element, values) {
    element.innerHTML = values.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  }

  function renderChipBoard() {
    const board = $("#chip-board");
    board.innerHTML = "";
    const cellParts = new Map();
    for (const part of design.parts) {
      for (const cell of E.occupiedCells(part)) cellParts.set(`${cell.x}:${cell.y}`, part);
    }
    for (let y = 0; y < E.BOARD_SIZE; y += 1) {
      for (let x = 0; x < E.BOARD_SIZE; x += 1) {
        const cell = document.createElement("button");
        cell.className = "chip-cell";
        cell.dataset.x = x;
        cell.dataset.y = y;
        const part = cellParts.get(`${x}:${y}`);
        if (part) {
          const definition = E.PARTS[part.type];
          cell.classList.add("part", definition.kind);
          if (part.x === x && part.y === y) {
            cell.classList.add("origin");
            cell.textContent = definition.label;
          }
          if (selectedEndpoint === part.id) cell.classList.add("link-selected");
          cell.dataset.partId = part.id;
          cell.title = `${definition.label} at ${part.x + 1},${part.y + 1}`;
        } else {
          cell.setAttribute("aria-label", `Empty die cell ${x + 1}, ${y + 1}`);
        }
        board.appendChild(cell);
      }
    }
  }

  function connectionFor(a, b) {
    return design.connections.find(
      (connection) =>
        (connection.a === a && connection.b === b) || (connection.a === b && connection.b === a)
    );
  }

  function renderConnections() {
    const editor = $("#connection-editor");
    const rows = [
      ["cpu", "memory", "CPU ↔ memory (heavy)"],
      ["cpu", "io", "CPU ↔ display I/O (light)"],
      ["io", "memory", "Display I/O ↔ memory (medium)"],
    ];
    editor.innerHTML = rows
      .map(([a, b, label]) => {
        const connection = connectionFor(a, b);
        return `<div class="connection-row"><strong>${label}</strong>
          <button data-connection-type="${a}:${b}" ${connection ? "" : "disabled"}>${connection ? connection.type : "missing"}</button>
          <button data-remove-link="${a}:${b}" ${connection ? "" : "disabled"}>Remove</button></div>`;
      })
      .join("");
  }

  function renderDesign() {
    profile = E.calculateDesign(design);
    $("#cpu-type").value = design.parts.find((part) => part.id === "cpu")?.type || "efficientCpu";
    $("#memory-type").value = design.parts.find((part) => part.id === "memory")?.type || "standardMemory";
    $("#cooling-enabled").checked = design.parts.some((part) => part.id === "cooling");
    $("#routing").value = design.routing;
    $$("[data-part-id]").forEach((button) => button.classList.toggle("selected", button.dataset.partId === selectedPart));
    renderChipBoard();
    renderConnections();
    const eligibility = $("#eligibility");
    eligibility.className = `status ${profile.eligible ? "pass" : "block"}`;
    eligibility.innerHTML = profile.eligible
      ? `<strong>Eligible to submit</strong><br>Responsiveness passes and the design is complete.`
      : `<strong>Submission blocked</strong><br>${profile.errors[0] || "Contract responsiveness is below 90."}`;
    setMetrics($("#design-metrics"), [
      ["Responsiveness", `${profile.responsiveness} / 90`],
      ["Material / attempt", money(profile.materialCost)],
      ["Expected yield", percent(profile.yieldRate)],
      ["Expected waste", percent(profile.wasteRate)],
      ["Cost / accepted", money(profile.costPerAccepted)],
      ["Margin / accepted", money(profile.marginPerAccepted)],
      ["Projected contract", money(profile.contractResult)],
      ["Process load", `${profile.cycles.process}s`],
      ["Inspection load", `${profile.cycles.inspection}s`],
      ["Test load", `${profile.cycles.test}s`],
      ["Package load", `${profile.cycles.packaging}s`],
    ]);
    setList($("#design-diagnosis"), [...profile.errors, ...profile.diagnoses]);
    $("#submit-design").disabled = !profile.eligible;
  }

  function invalidateSubmission() {
    if (submittedProfile) {
      submittedProfile = null;
      running = false;
      toast("Design changed. Resubmit it before production.");
    }
  }

  function placePart(partId, x, y) {
    const part = design.parts.find((candidate) => candidate.id === partId);
    if (!part) return;
    const old = { x: part.x, y: part.y };
    part.x = x;
    part.y = y;
    const result = E.calculateDesign(design);
    const placementError = result.errors.find((error) => error.includes("outside") || error.includes("overlaps") || error.includes("touch"));
    if (placementError) {
      part.x = old.x;
      part.y = old.y;
      toast(placementError);
      return;
    }
    selectedPart = null;
    invalidateSubmission();
    renderAll();
  }

  function handlePartClick(partId) {
    if (selectedPart) {
      selectedPart = null;
      renderDesign();
      return;
    }
    if (!selectedEndpoint) {
      selectedEndpoint = partId;
      renderChipBoard();
      return;
    }
    if (selectedEndpoint === partId) {
      selectedEndpoint = null;
      renderChipBoard();
      return;
    }
    const first = design.parts.find((part) => part.id === selectedEndpoint);
    const second = design.parts.find((part) => part.id === partId);
    const allowed = first && second && ["cpu:memory", "cpu:io", "io:memory"].includes([first.id, second.id].sort().join(":"));
    if (!allowed) {
      toast("Only the three required functional links can be connected in this spike.");
    } else if (connectionFor(first.id, second.id)) {
      toast("Those parts are already connected.");
    } else {
      design.connections.push({ a: first.id, b: second.id, type: "standard" });
      invalidateSubmission();
    }
    selectedEndpoint = null;
    renderAll();
  }

  function renderFactoryBoard() {
    const board = $("#factory-board");
    board.innerHTML = "";
    for (let y = 0; y < E.FACTORY_HEIGHT; y += 1) {
      for (let x = 0; x < E.FACTORY_WIDTH; x += 1) {
        const cell = document.createElement("button");
        const item = factory.find((candidate) => candidate.x === x && candidate.y === y);
        cell.className = `factory-cell ${item?.type || ""}`;
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.textContent = item && item.type !== "track" ? E.FACTORY_ITEMS[item.type].label : "";
        cell.title = item ? E.FACTORY_ITEMS[item.type].label : `Empty floor cell ${x + 1},${y + 1}`;
        board.appendChild(cell);
      }
    }
  }

  function renderFactory() {
    $("#cash").textContent = money(cash);
    $("#borrow").disabled = borrowed;
    $("#auto-build").disabled = factory.length > 0;
    $$("[data-factory-tool]").forEach((button) => button.classList.toggle("selected", button.dataset.factoryTool === factoryTool));
    renderFactoryBoard();
    const validation = E.validateFactory(factory);
    const status = $("#factory-validity");
    status.className = `status ${validation.valid ? "pass" : "block"}`;
    status.innerHTML = validation.valid
      ? "<strong>Line ready</strong><br>All production and reject paths are connected."
      : `<strong>Production blocked</strong><br>${validation.errors[0]}`;
    setList($("#route-errors"), validation.errors);
    setMetrics($("#factory-metrics"), [
      ["Installed capital", money(validation.cost)],
      ["Debt", borrowed ? "$16,000 · repayment deferred" : "$0"],
      ["Connected scanners", validation.connectedInspections],
      ["Floor cells used", `${factory.length} / ${E.FACTORY_WIDTH * E.FACTORY_HEIGHT}`],
    ]);
  }

  function placeFactoryItem(x, y) {
    const existing = factory.find((item) => item.x === x && item.y === y);
    if (factoryTool === "erase") {
      if (existing) {
        cash += E.FACTORY_ITEMS[existing.type].cost;
        factory = factory.filter((item) => item !== existing);
        $("#purchase-message").textContent = `${E.FACTORY_ITEMS[existing.type].label} removed and refunded.`;
      }
      renderAll();
      return;
    }
    if (existing) {
      $("#purchase-message").textContent = "That floor cell is occupied. Select Erase first.";
      return;
    }
    const cost = E.FACTORY_ITEMS[factoryTool].cost;
    if (cash < cost) {
      $("#purchase-message").textContent = `Cannot buy ${E.FACTORY_ITEMS[factoryTool].label}: need ${money(cost)}, have ${money(cash)}.`;
      return;
    }
    cash -= cost;
    factory.push({ type: factoryTool, x, y });
    $("#purchase-message").textContent = `${E.FACTORY_ITEMS[factoryTool].label} placed for ${money(cost)}.`;
    renderAll();
  }

  function addSecondScanner() {
    const scannerCost = 12000;
    const transportCost = 600;
    const totalCost = scannerCost + transportCost;
    if (production.cash < totalCost) {
      $("#upgrade-message").textContent = `Purchase blocked: need ${money(totalCost)} including transport, run cash is ${money(production.cash)}.`;
      return;
    }
    if (E.validateFactory(factory).connectedInspections >= 2) {
      $("#upgrade-message").textContent = "A second connected scanner is already installed.";
      return;
    }
    const additions = [
      { type: "inspection", x: 5, y: 2, capitalCost: scannerCost },
      { type: "track", x: 3, y: 2 },
      { type: "track", x: 4, y: 2 },
      { type: "track", x: 6, y: 2 },
    ];
    if (additions.some((addition) => factory.some((item) => item.x === addition.x && item.y === addition.y))) {
      $("#upgrade-message").textContent = "Reserved scanner expansion cells (4–7, row 3) are occupied.";
      return;
    }
    production.cash -= totalCost;
    factory.push(...additions);
    $("#upgrade-message").textContent = "Second scanner connected. Inspection capacity doubled; the next bottleneck is shown above.";
    renderAll();
  }

  function renderProduction() {
    const validation = E.validateFactory(factory);
    const ready = Boolean(submittedProfile && validation.valid);
    const blocker = $("#run-blocker");
    blocker.className = `status ${ready ? "pass" : "block"}`;
    blocker.innerHTML = ready
      ? "<strong>Ready to run.</strong> Accepted packages earn revenue; inspection and test rejects go to garbage."
      : `<strong>Cannot run.</strong> ${!submittedProfile ? "Submit an eligible chip design." : validation.errors[0]}`;
    $("#run-toggle").disabled = !ready || production.complete;
    $("#run-toggle").textContent = running ? "Pause" : production.complete ? "Contract complete" : "Run";
    $("#flow-line").classList.toggle("running", running);
    $("#accepted").textContent = number(production.accepted, 1);
    $("#input-kits").textContent = number(production.inputKits, 1);
    const rejects = production.inspectedRejects + production.testRejects;
    $("#rejects").textContent = number(rejects, 1);
    $("#run-cash").textContent = money(production.cash);

    const activeProfile = submittedProfile || profile;
    const rate = validation.valid ? E.productionRate(activeProfile, factory) : null;
    $("#rate").textContent = rate ? `${rate.acceptedPerMinute}/min` : "—";
    $("#bottleneck").textContent = rate ? rate.bottleneck : "—";
    setMetrics($("#economy-metrics"), [
      ["Revenue", money(production.revenue)],
      ["Materials + operation", money(production.productionCost)],
      ["Observed net", money(production.revenue - production.productionCost)],
      ["Elapsed factory time", `${number(production.elapsedSeconds, 0)}s`],
      ["Contract progress", percent(production.accepted / E.CONTRACT.quantity)],
    ]);
    const capacityMetrics = rate
      ? Object.entries(rate.effectiveCycles).map(([machine, cycle]) => {
          const bottleneckCycle = Math.max(...Object.values(rate.effectiveCycles));
          const utilization = (cycle / bottleneckCycle) * 100;
          const queue = utilization >= 99.5 ? "queue building" : "capacity available";
          return [`${machine[0].toUpperCase()}${machine.slice(1)}`, `${number(cycle, 1)}s · ${number(utilization, 0)}% · ${queue}`];
        })
      : [];
    setMetrics($("#profile-metrics"), [
      ["Expected yield", percent(activeProfile.yieldRate)],
      ["Observed yield", production.attempts ? percent(production.accepted / production.attempts) : "Awaiting production"],
      ["Expected loss / attempt", money((activeProfile.materialCost + activeProfile.operatingCost) * activeProfile.wasteRate)],
      ["Material / attempt", money(activeProfile.materialCost)],
      ["Operating / attempt", money(activeProfile.operatingCost)],
      ["Expected margin / accepted", money(activeProfile.marginPerAccepted)],
      ...capacityMetrics,
    ]);
  }

  function renderAll() {
    renderDesign();
    renderFactory();
    renderProduction();
  }

  function resetProduction() {
    running = false;
    production = E.initialProductionState(0);
    renderProduction();
  }

  function tick() {
    if (!running || !submittedProfile) return;
    try {
      production = E.advanceProduction(submittedProfile, factory, production, 0.25, Number($("#speed").value));
      if (production.complete || production.inputKits <= 0) running = false;
      renderProduction();
    } catch (error) {
      running = false;
      toast(error.message);
      renderProduction();
    }
  }

  function bindEvents() {
    $$(".tab").forEach((button) =>
      button.addEventListener("click", () => {
        $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
        $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === `${button.dataset.screen}-screen`));
      })
    );
    $$("[data-preset]").forEach((button) =>
      button.addEventListener("click", () => {
        design = E.scenarioDesign(button.dataset.preset);
        selectedPart = null;
        selectedEndpoint = null;
        invalidateSubmission();
        renderAll();
      })
    );
    $("#cpu-type").addEventListener("change", (event) => {
      design.parts.find((part) => part.id === "cpu").type = event.target.value;
      invalidateSubmission();
      renderAll();
    });
    $("#memory-type").addEventListener("change", (event) => {
      design.parts.find((part) => part.id === "memory").type = event.target.value;
      invalidateSubmission();
      renderAll();
    });
    $("#cooling-enabled").addEventListener("change", (event) => {
      const cooling = design.parts.find((part) => part.id === "cooling");
      if (event.target.checked && !cooling) design.parts.push({ id: "cooling", type: "cooling", x: 1, y: 3 });
      if (!event.target.checked && cooling) design.parts = design.parts.filter((part) => part !== cooling);
      invalidateSubmission();
      renderAll();
    });
    $("#routing").addEventListener("change", (event) => {
      design.routing = event.target.value;
      invalidateSubmission();
      renderAll();
    });
    $("#part-palette").addEventListener("click", (event) => {
      const button = event.target.closest("[data-part-id]");
      if (!button) return;
      if (!design.parts.some((part) => part.id === button.dataset.partId)) {
        toast("Enable cooling before placing it.");
        return;
      }
      selectedPart = selectedPart === button.dataset.partId ? null : button.dataset.partId;
      selectedEndpoint = null;
      renderDesign();
    });
    $("#chip-board").addEventListener("click", (event) => {
      const cell = event.target.closest(".chip-cell");
      if (!cell) return;
      if (selectedPart) placePart(selectedPart, Number(cell.dataset.x), Number(cell.dataset.y));
      else if (cell.dataset.partId) handlePartClick(cell.dataset.partId);
    });
    $("#connection-editor").addEventListener("click", (event) => {
      const typeButton = event.target.closest("[data-connection-type]");
      const removeButton = event.target.closest("[data-remove-link]");
      if (typeButton) {
        const [a, b] = typeButton.dataset.connectionType.split(":");
        const connection = connectionFor(a, b);
        if (connection.type === "standard") {
          if (design.connections.some((candidate) => candidate.type === "express")) {
            toast("Only one express connection is allowed.");
            return;
          }
          connection.type = "express";
        } else connection.type = "standard";
        invalidateSubmission();
        renderAll();
      } else if (removeButton) {
        const [a, b] = removeButton.dataset.removeLink.split(":");
        const connection = connectionFor(a, b);
        design.connections = design.connections.filter((candidate) => candidate !== connection);
        invalidateSubmission();
        renderAll();
      }
    });
    $("#submit-design").addEventListener("click", () => {
      submittedProfile = E.calculateDesign(design);
      resetProduction();
      toast("Design submitted. Build and validate the factory line.");
      renderAll();
    });
    $("#borrow").addEventListener("click", () => {
      cash += E.CONTRACT.borrowing;
      borrowed = true;
      $("#purchase-message").textContent = "Borrowed $16,000. Repayment is displayed as deferred in this spike.";
      renderAll();
    });
    $("#auto-build").addEventListener("click", () => {
      const blueprint = E.starterFactory();
      const cost = E.factoryCost(blueprint);
      if (cash < cost) {
        $("#purchase-message").textContent = `Starter line costs ${money(cost)}. Borrow working capital first.`;
        return;
      }
      factory = blueprint;
      cash -= cost;
      $("#purchase-message").textContent = "Starter line installed with ten transport segments and physical reject handling.";
      renderAll();
    });
    $("#clear-factory").addEventListener("click", () => {
      cash += E.factoryCost(factory);
      factory = [];
      running = false;
      $("#purchase-message").textContent = "Floor cleared and installed capital refunded.";
      renderAll();
    });
    $("#factory-palette").addEventListener("click", (event) => {
      const button = event.target.closest("[data-factory-tool]");
      if (!button) return;
      factoryTool = button.dataset.factoryTool;
      renderFactory();
    });
    $("#factory-board").addEventListener("click", (event) => {
      const cell = event.target.closest(".factory-cell");
      if (cell) placeFactoryItem(Number(cell.dataset.x), Number(cell.dataset.y));
    });
    $("#run-toggle").addEventListener("click", () => {
      running = !running;
      renderProduction();
    });
    $("#reset-production").addEventListener("click", resetProduction);
    $("#buy-scanner").addEventListener("click", addSecondScanner);
    timer = window.setInterval(tick, 250);
    window.addEventListener("beforeunload", () => window.clearInterval(timer));
  }

  function initialize() {
    const palette = $("#factory-palette");
    palette.innerHTML =
      Object.entries(E.FACTORY_ITEMS)
        .map(([type, item]) => `<button data-factory-tool="${type}">${item.label}<br>${money(item.cost)}</button>`)
        .join("") + '<button data-factory-tool="erase">Erase / refund</button>';
    bindEvents();
    renderAll();
  }

  initialize();
})();
