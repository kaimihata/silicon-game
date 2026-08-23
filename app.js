import { FactoryView } from "./factory-scene.js";

(function () {
  "use strict";

  const E = window.ChipCityEngine;
  let design = E.defaultDesign();
  let profile = E.calculateDesign(design);
  let submittedProfile = null;
  let selectedEndpoint = null;
  let chipDrag = null;
  let factoryTool = "track";
  let factory = [];
  let cash = E.CONTRACT.startingCash;
  let borrowed = false;
  let production = E.initialProductionState(0);
  let running = false;
  let timer = null;
  let factoryView = null;
  let factoryRotation = 0;
  let selectedFactoryItem = null;
  let showStarterBlueprint = false;
  let factoryHistory = [];
  let factoryFuture = [];
  let activeFactoryEdit = null;
  let factoryRenderQueued = false;

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
    for (let y = 0; y < E.BOARD_SIZE; y += 1) {
      for (let x = 0; x < E.BOARD_SIZE; x += 1) {
        const cell = document.createElement("div");
        cell.className = "chip-cell";
        cell.style.gridColumn = String(x + 1);
        cell.style.gridRow = String(y + 1);
        cell.setAttribute("aria-hidden", "true");
        board.appendChild(cell);
      }
    }

    for (const part of design.parts) {
      const definition = E.PARTS[part.type];
      const element = document.createElement("button");
      element.type = "button";
      element.className = `chip-part ${definition.kind}`;
      if (selectedEndpoint === part.id) element.classList.add("link-selected");
      element.dataset.partId = part.id;
      element.style.gridColumn = `${part.x + 1} / span ${definition.w}`;
      element.style.gridRow = `${part.y + 1} / span ${definition.h}`;
      element.innerHTML = `<strong>${definition.label}</strong><span>${definition.w}&times;${definition.h}</span>`;
      element.title = `Drag ${definition.label} to move it, or click to select a connection endpoint.`;
      element.setAttribute(
        "aria-label",
        `${definition.label} at column ${part.x + 1}, row ${part.y + 1}. Drag to move or click to connect.`
      );
      board.appendChild(element);
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
    renderChipBoard();
    renderConnections();
    const eligibility = $("#eligibility");
    eligibility.className = `status ${profile.eligible ? "pass" : "block"}`;
    eligibility.innerHTML = profile.eligible
      ? `<strong>Eligible to submit</strong><br>Responsiveness passes and the design is complete.`
      : `<strong>Submission blocked</strong><br>${profile.errors[0] || "Contract responsiveness is below 90."}`;
    setMetrics($("#design-metrics"), [
      ["Responsiveness", `${profile.responsiveness} / 90`],
      ["Purchased kit / attempt", money(profile.materialCost)],
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

  function placementError(partId, x, y) {
    const draft = {
      ...design,
      parts: design.parts.map((part) => part.id === partId ? { ...part, x, y } : { ...part }),
      connections: design.connections.map((connection) => ({ ...connection })),
    };
    return E.calculateDesign(draft).errors.find(
      (error) => error.includes("outside") || error.includes("overlaps") || error.includes("touch")
    );
  }

  function chipCellAt(clientX, clientY) {
    const board = $("#chip-board");
    const bounds = board.getBoundingClientRect();
    if (
      clientX < bounds.left ||
      clientY < bounds.top ||
      clientX >= bounds.right ||
      clientY >= bounds.bottom
    ) {
      return null;
    }
    return {
      x: Math.floor(((clientX - bounds.left) / bounds.width) * E.BOARD_SIZE),
      y: Math.floor(((clientY - bounds.top) / bounds.height) * E.BOARD_SIZE),
    };
  }

  function placePart(partId, x, y) {
    const part = design.parts.find((candidate) => candidate.id === partId);
    if (!part) return false;
    if (part.x === x && part.y === y) {
      renderChipBoard();
      return true;
    }
    const error = placementError(partId, x, y);
    if (error) {
      toast(error);
      return false;
    }
    part.x = x;
    part.y = y;
    invalidateSubmission();
    renderAll();
    return true;
  }

  function handlePartClick(partId) {
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

  function cloneFactory(items = factory) {
    return items.map((item) => ({ ...item }));
  }

  function factorySnapshot() {
    return {
      factory: cloneFactory(),
      cash,
      borrowed,
      productionCash: production.cash,
    };
  }

  function restoreFactorySnapshot(snapshot) {
    factory = cloneFactory(snapshot.factory);
    cash = snapshot.cash;
    borrowed = snapshot.borrowed;
    production.cash = snapshot.productionCash;
    selectedFactoryItem = null;
    running = false;
  }

  function beginFactoryEdit() {
    running = false;
    if (!activeFactoryEdit) activeFactoryEdit = factorySnapshot();
  }

  function endFactoryEdit() {
    if (!activeFactoryEdit) return;
    const changed =
      activeFactoryEdit.cash !== cash ||
      JSON.stringify(activeFactoryEdit.factory) !== JSON.stringify(factory);
    if (changed) {
      factoryHistory.push(activeFactoryEdit);
      factoryFuture = [];
    }
    activeFactoryEdit = null;
    renderFactory();
    renderProduction();
  }

  function clearFactoryHistory() {
    factoryHistory = [];
    factoryFuture = [];
    $("#undo-factory").disabled = true;
    $("#redo-factory").disabled = true;
  }

  function queueFactoryRender() {
    if (factoryRenderQueued) return;
    factoryRenderQueued = true;
    queueMicrotask(() => {
      factoryRenderQueued = false;
      renderFactory();
      renderProduction();
    });
  }

  function factoryItemCost(item) {
    return item.capitalCost ?? E.FACTORY_ITEMS[item.type]?.cost ?? 0;
  }

  function refundFactoryItem(item) {
    const cost = factoryItemCost(item);
    const productionPortion = item.capitalFromProduction || 0;
    production.cash += productionPortion;
    cash += cost - productionPortion;
  }

  function applyFactoryAction(action) {
    if (action.type === "move") {
      const item = factory.find((candidate) => candidate.x === action.fromX && candidate.y === action.fromY);
      const occupied = factory.some(
        (candidate) => candidate !== item && candidate.x === action.x && candidate.y === action.y
      );
      if (!item || occupied) {
        $("#purchase-message").textContent = occupied
          ? "That destination is occupied."
          : "The selected machine is no longer on the floor.";
        queueFactoryRender();
        return false;
      }
      item.x = action.x;
      item.y = action.y;
      selectedFactoryItem = { x: action.x, y: action.y };
      $("#purchase-message").textContent = `${E.FACTORY_ITEMS[item.type].label} moved without additional cost.`;
      queueFactoryRender();
      return true;
    }

    const existing = factory.find((item) => item.x === action.x && item.y === action.y);
    if (action.type === "erase") {
      if (!existing) return false;
      refundFactoryItem(existing);
      factory = factory.filter((item) => item !== existing);
      if (selectedFactoryItem?.x === action.x && selectedFactoryItem?.y === action.y) selectedFactoryItem = null;
      $("#purchase-message").textContent = `${E.FACTORY_ITEMS[existing.type].label} removed and refunded.`;
      queueFactoryRender();
      return true;
    }

    if (existing) {
      $("#purchase-message").textContent = "That floor cell is occupied. Move or erase it first.";
      queueFactoryRender();
      return false;
    }

    const cost = E.FACTORY_ITEMS[action.itemType]?.cost;
    if (cost === undefined) return false;
    const availableCapital = cash + Math.max(0, production.cash);
    if (availableCapital < cost) {
      $("#purchase-message").textContent =
        `Cannot buy ${E.FACTORY_ITEMS[action.itemType].label}: need ${money(cost)}, have ${money(availableCapital)} available.`;
      queueFactoryRender();
      return false;
    }

    const buildCashSpent = Math.min(cash, cost);
    const productionCashSpent = cost - buildCashSpent;
    cash -= buildCashSpent;
    production.cash -= productionCashSpent;
    factory.push({
      type: action.itemType,
      x: action.x,
      y: action.y,
      rotation: action.rotation || 0,
      capitalFromProduction: productionCashSpent || undefined,
    });
    const sourceNote = productionCashSpent ? `, including ${money(productionCashSpent)} from run cash` : "";
    $("#purchase-message").textContent =
      `${E.FACTORY_ITEMS[action.itemType].label} placed for ${money(cost)}${sourceNote}.`;
    queueFactoryRender();
    return true;
  }

  function undoFactoryEdit() {
    if (!factoryHistory.length) return;
    const previous = factoryHistory.pop();
    factoryFuture.push(factorySnapshot());
    restoreFactorySnapshot(previous);
    $("#purchase-message").textContent = "Factory edit undone.";
    renderAll();
  }

  function redoFactoryEdit() {
    if (!factoryFuture.length) return;
    const next = factoryFuture.pop();
    factoryHistory.push(factorySnapshot());
    restoreFactorySnapshot(next);
    $("#purchase-message").textContent = "Factory edit restored.";
    renderAll();
  }

  function rotateFactorySelection() {
    const selected = selectedFactoryItem &&
      factory.find((item) => item.x === selectedFactoryItem.x && item.y === selectedFactoryItem.y);
    if (selected && selected.type !== "track") {
      beginFactoryEdit();
      selected.rotation = ((selected.rotation || 0) + 90) % 360;
      $("#purchase-message").textContent =
        `${E.FACTORY_ITEMS[selected.type].label} rotated to ${selected.rotation} degrees.`;
      endFactoryEdit();
      return;
    }
    factoryRotation = (factoryRotation + 90) % 360;
    factoryView.rotateTool();
    renderFactory();
  }

  function renderComponentKit() {
    const activeProfile = submittedProfile || profile;
    const kit = activeProfile.componentKit;
    const sourcing = E.factorySourcing(activeProfile, factory);
    $("#kit-name").textContent = `${submittedProfile ? "Submitted" : "Draft"}: ${kit.name}`;
    const contents = $("#kit-contents");
    contents.className = "kit-contents";
    contents.innerHTML = kit.items
      .map((item) => {
        const internallyProduced = item.id === "memory" && sourcing.memorySource === "internal";
        const source = internallyProduced ? "internal" : money(item.supplierCost);
        return `<li><strong>${item.quantity}&times; ${item.label}</strong><span>${source}</span></li>`;
      })
      .join("");
    $("#kit-sourcing").innerHTML = sourcing.memorySource === "internal"
      ? `<strong>Memory supplied internally.</strong> The dock supplies the remaining kit for ${money(sourcing.supplierCost)}; fabrication adds ${money(sourcing.internalComponentCost)} and saves ${money(sourcing.savingsPerAttempt)} per attempt.`
      : `The Design Kit Dock purchases this complete recipe for <strong>${money(sourcing.materialCost)} per attempt</strong>. Connect a Memory Fabricator to Process to replace the ${money(kit.memory.supplierCost)} memory purchase with ${money(kit.memory.internalCost)} internal cost.`;
  }

  function renderFactory() {
    $("#cash").textContent = money(cash);
    $("#borrow").disabled = borrowed;
    $("#starter-hint").classList.toggle("selected", showStarterBlueprint);
    $("#starter-hint").textContent = showStarterBlueprint ? "Hide starter blueprint" : "Show starter blueprint";
    $("#undo-factory").disabled = !factoryHistory.length;
    $("#redo-factory").disabled = !factoryFuture.length;
    $$("[data-factory-tool]").forEach((button) => button.classList.toggle("selected", button.dataset.factoryTool === factoryTool));
    const selected = selectedFactoryItem &&
      factory.find((item) => item.x === selectedFactoryItem.x && item.y === selectedFactoryItem.y);
    $("#rotate-factory").firstChild.textContent = selected ? "Rotate selected machine " : "Rotate placement ";
    $("#rotation-label").innerHTML = `${selected?.rotation || factoryRotation}&deg;`;
    factoryView?.setState({
      items: factory,
      selectedTool: factoryTool,
      rotation: factoryRotation,
      running,
      selectedCell: selectedFactoryItem,
      blueprint: showStarterBlueprint ? E.starterFactory() : [],
    });
    renderComponentKit();
    const validation = E.validateFactory(factory);
    const activeProfile = submittedProfile || profile;
    const sourcing = E.factorySourcing(activeProfile, factory);
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
      ["Internal memory lines", validation.connectedMemoryFabricators],
      ["Kit input / attempt", money(sourcing.materialCost)],
      ["Floor cells used", `${factory.length} / ${E.FACTORY_WIDTH * E.FACTORY_HEIGHT}`],
    ]);
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
      { type: "inspection", x: 5, y: 2, capitalCost: scannerCost, capitalFromProduction: scannerCost },
      { type: "track", x: 3, y: 2, capitalFromProduction: 200 },
      { type: "track", x: 4, y: 2, capitalFromProduction: 200 },
      { type: "track", x: 6, y: 2, capitalFromProduction: 200 },
    ];
    if (additions.some((addition) => factory.some((item) => item.x === addition.x && item.y === addition.y))) {
      $("#upgrade-message").textContent = "Reserved scanner expansion cells (4–7, row 3) are occupied.";
      return;
    }
    beginFactoryEdit();
    production.cash -= totalCost;
    factory.push(...additions);
    $("#upgrade-message").textContent = "Second scanner connected. Inspection capacity doubled; the next bottleneck is shown above.";
    endFactoryEdit();
    renderAll();
  }

  function renderProduction() {
    factoryView?.setRunning(running);
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
    const sourcing = E.factorySourcing(activeProfile, factory);
    const expectedCostPerAccepted = (sourcing.materialCost + activeProfile.operatingCost) / activeProfile.yieldRate;
    const expectedMarginPerAccepted = E.CONTRACT.price - expectedCostPerAccepted;
    const rate = validation.valid ? E.productionRate(activeProfile, factory) : null;
    $("#rate").textContent = rate ? `${rate.acceptedPerMinute}/min` : "—";
    $("#bottleneck").textContent = rate ? rate.bottleneck : "—";
    setMetrics($("#economy-metrics"), [
      ["Revenue", money(production.revenue)],
      ["Purchased components", money(production.supplierCost)],
      ["Internal components", money(production.internalComponentCost)],
      ["Factory operation", money(production.operatingCost)],
      ["Total production cost", money(production.productionCost)],
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
      ["Expected loss / attempt", money((sourcing.materialCost + activeProfile.operatingCost) * activeProfile.wasteRate)],
      ["Component source", sourcing.memorySource === "internal" ? "Memory internal" : "All purchased"],
      ["Material / attempt", money(sourcing.materialCost)],
      ["Internal savings / attempt", money(sourcing.savingsPerAttempt)],
      ["Operating / attempt", money(activeProfile.operatingCost)],
      ["Expected margin / accepted", money(expectedMarginPerAccepted)],
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
    clearFactoryHistory();
    renderProduction();
  }

  function tick() {
    if (!running || !submittedProfile) return;
    try {
      if (factoryHistory.length || factoryFuture.length) clearFactoryHistory();
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
        if (button.dataset.screen === "factory") window.requestAnimationFrame(() => factoryView.resize());
      })
    );
    $$("[data-preset]").forEach((button) =>
      button.addEventListener("click", () => {
        design = E.scenarioDesign(button.dataset.preset);
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
    $("#chip-board").addEventListener("pointerdown", (event) => {
      const element = event.target.closest(".chip-part");
      if (!element) return;
      const part = design.parts.find((candidate) => candidate.id === element.dataset.partId);
      const cell = chipCellAt(event.clientX, event.clientY);
      if (!part || !cell) return;
      chipDrag = {
        partId: part.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: part.x,
        originY: part.y,
        grabX: cell.x - part.x,
        grabY: cell.y - part.y,
        target: null,
        error: null,
        dragging: false,
      };
    });
    window.addEventListener("pointermove", (event) => {
      if (!chipDrag || event.pointerId !== chipDrag.pointerId) return;
      const element = $(`.chip-part[data-part-id="${chipDrag.partId}"]`);
      if (!element) return;
      const distance = Math.hypot(event.clientX - chipDrag.startX, event.clientY - chipDrag.startY);
      if (!chipDrag.dragging && distance < 5) return;
      chipDrag.dragging = true;
      event.preventDefault();

      const cell = chipCellAt(event.clientX, event.clientY);
      if (!cell) {
        chipDrag.target = null;
        chipDrag.error = "Drop the component within the chip board.";
        element.classList.add("dragging", "placement-invalid");
        element.classList.remove("placement-valid");
        return;
      }

      const x = cell.x - chipDrag.grabX;
      const y = cell.y - chipDrag.grabY;
      chipDrag.target = { x, y };
      chipDrag.error = placementError(chipDrag.partId, x, y);
      const cellSize = $("#chip-board").clientWidth / E.BOARD_SIZE;
      element.style.transform =
        `translate(${(x - chipDrag.originX) * cellSize}px, ${(y - chipDrag.originY) * cellSize}px)`;
      element.classList.add("dragging");
      element.classList.toggle("placement-valid", !chipDrag.error);
      element.classList.toggle("placement-invalid", Boolean(chipDrag.error));
    });
    window.addEventListener("pointerup", (event) => {
      if (!chipDrag || event.pointerId !== chipDrag.pointerId) return;
      const drag = chipDrag;
      chipDrag = null;
      if (!drag.dragging) {
        handlePartClick(drag.partId);
        return;
      }
      if (!drag.target || drag.error) {
        toast(drag.error || "Drop the component within the chip board.");
        renderChipBoard();
        return;
      }
      placePart(drag.partId, drag.target.x, drag.target.y);
    });
    window.addEventListener("pointercancel", () => {
      if (!chipDrag) return;
      chipDrag = null;
      renderChipBoard();
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
      toast(`${submittedProfile.componentKit.name} submitted. Its component kit now feeds the factory.`);
      renderAll();
    });
    $("#borrow").addEventListener("click", () => {
      beginFactoryEdit();
      cash += E.CONTRACT.borrowing;
      borrowed = true;
      $("#purchase-message").textContent = "Borrowed $16,000. Repayment is displayed as deferred in this spike.";
      endFactoryEdit();
      renderAll();
    });
    $("#starter-hint").addEventListener("click", () => {
      showStarterBlueprint = !showStarterBlueprint;
      $("#purchase-message").textContent = showStarterBlueprint
        ? "Blueprint enabled. Trace the ghost layout or build your own solution."
        : "Blueprint hidden.";
      renderFactory();
    });
    $("#undo-factory").addEventListener("click", undoFactoryEdit);
    $("#redo-factory").addEventListener("click", redoFactoryEdit);
    $("#rotate-factory").addEventListener("click", rotateFactorySelection);
    $("#clear-factory").addEventListener("click", () => {
      if (!factory.length) return;
      beginFactoryEdit();
      factory.forEach(refundFactoryItem);
      factory = [];
      selectedFactoryItem = null;
      running = false;
      $("#purchase-message").textContent = "Floor cleared and installed capital refunded.";
      endFactoryEdit();
      renderAll();
    });
    $("#factory-palette").addEventListener("click", (event) => {
      const button = event.target.closest("[data-factory-tool]");
      if (!button) return;
      factoryTool = button.dataset.factoryTool;
      selectedFactoryItem = null;
      renderFactory();
    });
    $("#factory-palette").addEventListener("dragstart", (event) => {
      const button = event.target.closest("[data-factory-tool]");
      if (!button || ["track", "erase"].includes(button.dataset.factoryTool)) {
        event.preventDefault();
        return;
      }
      factoryTool = button.dataset.factoryTool;
      selectedFactoryItem = null;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", factoryTool);
      renderFactory();
    });
    $("#factory-palette").addEventListener("dragend", () => factoryView.clearExternalPreview());
    $("#factory-board").addEventListener("dragover", (event) => {
      event.preventDefault();
      const itemType = event.dataTransfer.types.includes("text/plain") ? factoryTool : null;
      if (itemType) factoryView.previewClientPoint(event.clientX, event.clientY, itemType);
      event.dataTransfer.dropEffect = "copy";
    });
    $("#factory-board").addEventListener("dragleave", (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) factoryView.clearExternalPreview();
    });
    $("#factory-board").addEventListener("drop", (event) => {
      event.preventDefault();
      const itemType = event.dataTransfer.getData("text/plain") || factoryTool;
      beginFactoryEdit();
      factoryView.placeAtClientPoint(event.clientX, event.clientY, itemType, factoryRotation);
      endFactoryEdit();
    });
    $("#run-toggle").addEventListener("click", () => {
      running = !running;
      renderProduction();
    });
    $("#reset-production").addEventListener("click", resetProduction);
    $("#buy-scanner").addEventListener("click", addSecondScanner);
    window.addEventListener("keydown", (event) => {
      if (event.target.matches("input, select, textarea")) return;
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoFactoryEdit();
      } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoFactoryEdit();
      } else if (
        event.key.toLowerCase() === "r" &&
        $("#factory-screen").classList.contains("active")
      ) {
        event.preventDefault();
        rotateFactorySelection();
      }
    });
    timer = window.setInterval(tick, 250);
    window.addEventListener("beforeunload", () => window.clearInterval(timer));
  }

  function initialize() {
    const palette = $("#factory-palette");
    palette.innerHTML =
      Object.entries(E.FACTORY_ITEMS)
        .map(
          ([type, item]) =>
            `<button data-factory-tool="${type}" draggable="${!["track", "erase"].includes(type)}">${item.label}<br>${money(item.cost)}</button>`
        )
        .join("") + '<button data-factory-tool="erase">Erase / refund</button>';
    factoryView = new FactoryView({
      parent: "factory-board",
      width: E.FACTORY_WIDTH,
      height: E.FACTORY_HEIGHT,
      catalog: E.FACTORY_ITEMS,
      callbacks: {
        onAction: applyFactoryAction,
        onEditStart: beginFactoryEdit,
        onEditEnd: endFactoryEdit,
        onSelect(item) {
          selectedFactoryItem = { x: item.x, y: item.y };
          const details = item.type === "input"
            ? "It purchases and supplies the submitted chip's component kit."
            : item.type === "memoryFab"
              ? "Connect it to Process to replace purchased memory with lower-cost internal memory."
              : "Drag to move or press R to rotate.";
          $("#purchase-message").textContent = `${E.FACTORY_ITEMS[item.type].label} selected. ${details}`;
          $("#rotate-factory").firstChild.textContent = "Rotate selected machine ";
          $("#rotation-label").innerHTML = `${item.rotation || 0}&deg;`;
        },
      },
    });
    bindEvents();
    renderAll();
  }

  initialize();
})();
