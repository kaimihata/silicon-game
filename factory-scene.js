import Phaser from "phaser";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 640;
const CELL_SIZE = 68;
const GRID_LEFT = 72;
const GRID_TOP = 50;

const MACHINE_COLORS = Object.freeze({
  input: 0x28738d,
  process: 0x16877f,
  memoryFab: 0x7456a6,
  inspection: 0x456fa5,
  test: 0x8a65a1,
  packaging: 0xa97832,
  garbage: 0x914d4d,
  output: 0x28738d,
});

const MACHINE_CODES = Object.freeze({
  input: "IN",
  process: "PROC",
  memoryFab: "MEM",
  inspection: "SCAN",
  test: "TEST",
  packaging: "PACK",
  garbage: "SCRAP",
  output: "OUT",
});

function itemKey(item) {
  return `${item.x}:${item.y}`;
}

export class FactoryView {
  constructor({ parent, width, height, catalog, callbacks }) {
    this.width = width;
    this.height = height;
    this.catalog = catalog;
    this.callbacks = callbacks;
    this.items = [];
    this.blueprint = [];
    this.selectedTool = "track";
    this.rotation = 0;
    this.running = false;
    this.selectedCell = null;
    this.painting = false;
    this.lastPaintedCell = null;
    this.hoverCell = null;
    this.externalTool = null;
    this.machineObjects = [];

    const view = this;
    class FactoryScene extends Phaser.Scene {
      create() {
        view.scene = this;
        view.createScene();
      }

      update(time) {
        view.drawFlowAnimation(time);
      }
    }

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      backgroundColor: "#07151d",
      render: {
        antialias: true,
        pixelArt: false,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: FactoryScene,
    });
  }

  createScene() {
    this.scene.cameras.main.setBounds(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    this.gridGraphics = this.scene.add.graphics();
    this.blueprintGraphics = this.scene.add.graphics();
    this.trackGraphics = this.scene.add.graphics();
    this.flowGraphics = this.scene.add.graphics();
    this.hoverGraphics = this.scene.add.graphics().setDepth(20);
    this.scene.add.text(GRID_LEFT, 14, "FACTORY FLOOR  /  DRAG TO BUILD", {
      color: "#87aaa9",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
    });

    this.drawGrid();
    this.bindSceneInput();
    this.render();
  }

  bindSceneInput() {
    this.scene.input.on("pointermove", (pointer) => {
      if (pointer.middleButtonDown()) {
        const camera = this.scene.cameras.main;
        camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
        camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
        return;
      }

      const cell = this.pointerCell(pointer);
      this.hoverCell = cell;
      if (this.painting && cell && !this.sameCell(cell, this.lastPaintedCell)) {
        this.lastPaintedCell = cell;
        this.callbacks.onAction({
          type: this.selectedTool === "erase" ? "erase" : "place",
          itemType: this.selectedTool,
          x: cell.x,
          y: cell.y,
          rotation: this.rotation,
        });
      }
      this.drawHover();
    });

    this.scene.input.on("pointerdown", (pointer, gameObjects) => {
      if (pointer.middleButtonDown() || gameObjects.length) return;
      const cell = this.pointerCell(pointer);
      if (!cell) return;

      if (this.selectedTool === "track" || this.selectedTool === "erase") {
        this.painting = true;
        this.lastPaintedCell = cell;
        this.callbacks.onEditStart();
        this.callbacks.onAction({
          type: this.selectedTool === "erase" ? "erase" : "place",
          itemType: this.selectedTool,
          x: cell.x,
          y: cell.y,
          rotation: this.rotation,
        });
        return;
      }

      this.callbacks.onEditStart();
      this.callbacks.onAction({
        type: "place",
        itemType: this.selectedTool,
        x: cell.x,
        y: cell.y,
        rotation: this.rotation,
      });
      this.callbacks.onEditEnd();
    });

    this.scene.input.on("pointerup", () => {
      if (!this.painting) return;
      this.painting = false;
      this.lastPaintedCell = null;
      this.callbacks.onEditEnd();
    });

    this.scene.input.on("pointerout", () => {
      if (this.painting) {
        this.painting = false;
        this.lastPaintedCell = null;
        this.callbacks.onEditEnd();
      }
      if (!this.externalTool) {
        this.hoverCell = null;
        this.drawHover();
      }
    });

    this.scene.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
      const camera = this.scene.cameras.main;
      const nextZoom = Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.8, 1.35);
      camera.zoomTo(nextZoom, 90);
    });

    this.scene.game.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  setState({ items, selectedTool, rotation, running, selectedCell, blueprint }) {
    this.items = items.map((item) => ({ ...item }));
    this.selectedTool = selectedTool;
    this.rotation = rotation;
    this.running = running;
    this.selectedCell = selectedCell ? { ...selectedCell } : null;
    this.blueprint = blueprint ? blueprint.map((item) => ({ ...item })) : [];
    if (this.scene) this.render();
  }

  resize() {
    if (this.game?.scale) this.game.scale.refresh();
  }

  rotateTool() {
    this.rotation = (this.rotation + 90) % 360;
    this.drawHover();
  }

  setRunning(running) {
    this.running = running;
    if (!running) this.flowGraphics?.clear();
  }

  previewClientPoint(clientX, clientY, itemType) {
    this.externalTool = itemType;
    this.hoverCell = this.clientPointToCell(clientX, clientY);
    this.drawHover();
  }

  clearExternalPreview() {
    this.externalTool = null;
    this.hoverCell = null;
    this.drawHover();
  }

  placeAtClientPoint(clientX, clientY, itemType, rotation) {
    const cell = this.clientPointToCell(clientX, clientY);
    this.clearExternalPreview();
    if (!cell) return false;
    return this.callbacks.onAction({
      type: "place",
      itemType,
      x: cell.x,
      y: cell.y,
      rotation,
    });
  }

  clientPointToCell(clientX, clientY) {
    if (!this.scene) return null;
    const bounds = this.scene.game.canvas.getBoundingClientRect();
    const screenX = ((clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
    const screenY = ((clientY - bounds.top) / bounds.height) * VIEW_HEIGHT;
    const world = this.scene.cameras.main.getWorldPoint(screenX, screenY);
    return this.worldCell(world.x, world.y);
  }

  pointerCell(pointer) {
    const world = pointer.positionToCamera(this.scene.cameras.main);
    return this.worldCell(world.x, world.y);
  }

  worldCell(worldX, worldY) {
    const x = Math.floor((worldX - GRID_LEFT) / CELL_SIZE);
    const y = Math.floor((worldY - GRID_TOP) / CELL_SIZE);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return { x, y };
  }

  cellCenter(x, y) {
    return {
      x: GRID_LEFT + x * CELL_SIZE + CELL_SIZE / 2,
      y: GRID_TOP + y * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  sameCell(first, second) {
    return Boolean(first && second && first.x === second.x && first.y === second.y);
  }

  itemAt(x, y, ignoredItem = null) {
    return this.items.find((item) => item !== ignoredItem && item.x === x && item.y === y);
  }

  drawGrid() {
    const graphics = this.gridGraphics;
    graphics.clear();
    graphics.fillStyle(0x081b24, 1);
    graphics.fillRoundedRect(
      GRID_LEFT - 12,
      GRID_TOP - 12,
      this.width * CELL_SIZE + 24,
      this.height * CELL_SIZE + 24,
      14
    );
    graphics.lineStyle(1, 0x183943, 1);
    for (let x = 0; x <= this.width; x += 1) {
      graphics.lineBetween(
        GRID_LEFT + x * CELL_SIZE,
        GRID_TOP,
        GRID_LEFT + x * CELL_SIZE,
        GRID_TOP + this.height * CELL_SIZE
      );
    }
    for (let y = 0; y <= this.height; y += 1) {
      graphics.lineBetween(
        GRID_LEFT,
        GRID_TOP + y * CELL_SIZE,
        GRID_LEFT + this.width * CELL_SIZE,
        GRID_TOP + y * CELL_SIZE
      );
    }
  }

  render() {
    this.machineObjects.forEach((object) => object.destroy());
    this.machineObjects = [];
    this.drawBlueprint();
    this.drawTracks();
    this.items.filter((item) => item.type !== "track").forEach((item) => this.drawMachine(item));
    this.drawHover();
  }

  drawBlueprint() {
    const graphics = this.blueprintGraphics;
    graphics.clear();
    if (!this.blueprint.length) return;
    graphics.lineStyle(2, 0x64c9f1, 0.28);
    graphics.fillStyle(0x64c9f1, 0.045);
    for (const item of this.blueprint) {
      if (this.itemAt(item.x, item.y)) continue;
      const left = GRID_LEFT + item.x * CELL_SIZE + 5;
      const top = GRID_TOP + item.y * CELL_SIZE + 5;
      if (item.type === "track") {
        const center = this.cellCenter(item.x, item.y);
        graphics.strokeCircle(center.x, center.y, 9);
      } else {
        graphics.fillRoundedRect(left, top, CELL_SIZE - 10, CELL_SIZE - 10, 8);
        graphics.strokeRoundedRect(left, top, CELL_SIZE - 10, CELL_SIZE - 10, 8);
      }
    }
  }

  drawTracks() {
    const graphics = this.trackGraphics;
    graphics.clear();
    const byPosition = new Map(this.items.map((item) => [itemKey(item), item]));
    for (const track of this.items.filter((item) => item.type === "track")) {
      const center = this.cellCenter(track.x, track.y);
      const neighbors = [
        { x: track.x, y: track.y - 1, ex: center.x, ey: center.y - CELL_SIZE / 2 },
        { x: track.x + 1, y: track.y, ex: center.x + CELL_SIZE / 2, ey: center.y },
        { x: track.x, y: track.y + 1, ex: center.x, ey: center.y + CELL_SIZE / 2 },
        { x: track.x - 1, y: track.y, ex: center.x - CELL_SIZE / 2, ey: center.y },
      ].filter((neighbor) => byPosition.has(`${neighbor.x}:${neighbor.y}`));

      graphics.fillStyle(0x183943, 1);
      graphics.fillRoundedRect(
        GRID_LEFT + track.x * CELL_SIZE + 7,
        GRID_TOP + track.y * CELL_SIZE + 7,
        CELL_SIZE - 14,
        CELL_SIZE - 14,
        9
      );
      graphics.lineStyle(10, 0x285866, 1);
      if (!neighbors.length) graphics.strokeCircle(center.x, center.y, 7);
      neighbors.forEach((neighbor) => graphics.lineBetween(center.x, center.y, neighbor.ex, neighbor.ey));
      graphics.fillStyle(0x55d6c8, 1);
      graphics.fillCircle(center.x, center.y, 6);
    }
  }

  drawMachine(item) {
    const center = this.cellCenter(item.x, item.y);
    const color = MACHINE_COLORS[item.type] ?? 0x45606a;
    const selected = this.selectedCell?.x === item.x && this.selectedCell?.y === item.y;
    const rectangle = this.scene.add
      .rectangle(0, 0, CELL_SIZE - 10, CELL_SIZE - 10, color, 1)
      .setStrokeStyle(selected ? 4 : 2, selected ? 0x70e1ad : 0xc8ffff, selected ? 1 : 0.55);
    const label = this.scene.add
      .text(0, 2, MACHINE_CODES[item.type] ?? item.type.toUpperCase(), {
        color: "#ecf7f5",
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    const direction = this.scene.add
      .text(0, -CELL_SIZE / 2 + 12, ">", {
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAngle(item.rotation || 0);
    const container = this.scene.add.container(center.x, center.y, [rectangle, label, direction]).setDepth(5);
    container.setSize(CELL_SIZE - 10, CELL_SIZE - 10);
    container.setInteractive({ useHandCursor: true });
    this.scene.input.setDraggable(container, this.selectedTool !== "erase");
    container.setData("item", item);

    container.on("pointerdown", () => {
      if (this.selectedTool === "erase") {
        this.painting = true;
        this.lastPaintedCell = { x: item.x, y: item.y };
        this.callbacks.onEditStart();
        this.callbacks.onAction({ type: "erase", x: item.x, y: item.y });
        return;
      }
      rectangle.setStrokeStyle(4, 0x70e1ad, 1);
      this.callbacks.onSelect(item);
    });
    container.on("dragstart", () => {
      container.setDepth(15);
      rectangle.setAlpha(0.72);
      this.callbacks.onEditStart();
    });
    container.on("drag", (pointer, dragX, dragY) => {
      const target = this.worldCell(dragX, dragY);
      if (!target) return;
      const snapped = this.cellCenter(target.x, target.y);
      container.x = snapped.x;
      container.y = snapped.y;
      const valid = !this.itemAt(target.x, target.y, item);
      rectangle.setStrokeStyle(3, valid ? 0x70e1ad : 0xff7b72, 1);
    });
    container.on("dragend", () => {
      const target = this.worldCell(container.x, container.y);
      if (target) {
        this.callbacks.onAction({
          type: "move",
          fromX: item.x,
          fromY: item.y,
          x: target.x,
          y: target.y,
        });
      }
      this.callbacks.onEditEnd();
      this.render();
    });

    this.machineObjects.push(container);
  }

  drawHover() {
    if (!this.hoverGraphics) return;
    this.hoverGraphics.clear();
    if (!this.hoverCell) return;
    const tool = this.externalTool || this.selectedTool;
    const occupied = this.itemAt(this.hoverCell.x, this.hoverCell.y);
    const valid = tool === "erase" ? Boolean(occupied) : !occupied;
    const left = GRID_LEFT + this.hoverCell.x * CELL_SIZE + 4;
    const top = GRID_TOP + this.hoverCell.y * CELL_SIZE + 4;
    this.hoverGraphics.fillStyle(valid ? 0x70e1ad : 0xff7b72, 0.16);
    this.hoverGraphics.lineStyle(3, valid ? 0x70e1ad : 0xff7b72, 0.9);
    this.hoverGraphics.fillRoundedRect(left, top, CELL_SIZE - 8, CELL_SIZE - 8, 8);
    this.hoverGraphics.strokeRoundedRect(left, top, CELL_SIZE - 8, CELL_SIZE - 8, 8);

    if (tool !== "track" && tool !== "erase") {
      const center = this.cellCenter(this.hoverCell.x, this.hoverCell.y);
      const radians = Phaser.Math.DegToRad(this.rotation);
      this.hoverGraphics.lineStyle(4, 0xffffff, 0.85);
      this.hoverGraphics.lineBetween(
        center.x,
        center.y,
        center.x + Math.cos(radians) * 22,
        center.y + Math.sin(radians) * 22
      );
    }
  }

  drawFlowAnimation(time) {
    if (!this.flowGraphics) return;
    this.flowGraphics.clear();
    if (!this.running) return;
    const pulse = (Math.sin(time / 170) + 1) / 2;
    this.flowGraphics.fillStyle(0x9bfff3, 0.45 + pulse * 0.5);
    for (const track of this.items.filter((item) => item.type === "track")) {
      const center = this.cellCenter(track.x, track.y);
      this.flowGraphics.fillCircle(center.x, center.y, 3 + pulse * 2);
    }
  }
}
