# Chip parts

**Status:** Starter part model grounded in the current greybox; full-game values and progression remain subject to iteration.

This document defines the functional elements available in final-chip designs. See [Game design](game-design.md) for the overall loop, [Component catalog](component-catalog.md) for model specifications, [Manufacturing metrics](manufacturing-metrics.md) for calculations, and [Factory machines](factory-machines.md) for production equipment.

## Physical abstraction

The final product is a multi-chip package assembled from chiplets, memory dies, power and thermal components, and die-to-die links. The design board represents their placement inside the package rather than functional blocks fabricated together on one monolithic die.

## Role of chip parts

Chip parts define the capabilities and physical pressures of the final product. They are selected and arranged in the final-chip designer.

A part choice may affect:

- product performance and eligible opportunities;
- required purchased or internally produced component modules;
- material quantity and quality;
- placement, connection distance, congestion, and heat;
- process, inspection, test, and packaging workload;
- expected yield and cost.

Chip parts do not specify where machines must be placed. They contribute requirements and workload to the manufacturing profile that the player must satisfy.

## Starter part families

### CPU

The CPU is the primary compute block and a major driver of performance, heat, cost, and manufacturing difficulty.

| Starter model | Product effect | Manufacturing pressure |
| --- | --- | --- |
| Dual-Core Processor (`CP-110`) | Two cores at 1.6 GHz with lower power and bandwidth demand | Lower purchase cost, placement work, inspection load, and test load |
| Quad-Core Processor (`CP-130`) | Four cores at 1.8 GHz with greater sustained-performance potential | Higher component cost, memory-bandwidth demand, power, inspection load, and test time |

Long-term CPU progression may introduce quality grades, suppliers, architectures, and internally produced variants. Those variants should preserve a meaningful choice between capability and production burden.

### Memory

Memory provides capacity or bandwidth required by the final product and interacts strongly with CPU placement and connections.

| Starter model | Product effect | Manufacturing pressure |
| --- | --- | --- |
| 1 GB LPDDR Memory (`MD-110`) | 1 GB capacity and 12.8 GB/s peak bandwidth | Lower component cost and normal inspection or test load |
| 2 GB LPDDR Memory (`MD-130`) | 2 GB capacity and 25.6 GB/s peak bandwidth | Higher component cost, power, inspection load, and electrical-test work |

Memory is the proposed first **wafer-production experiment** in the browser spike because it can begin as a purchased input and later become the output of a reusable internal line. For the full game's teaching order, simpler thermal-component production may introduce make-versus-buy before memory introduces wafer batches, yield, and binning.

### Interface chiplets

The **Display Controller** (`IO-110`) is the starter I/O chiplet. It provides one display pipeline, up to 12 Gb/s of external link capacity, and a target mode of 4K at 60 Hz.

| Product effect | Manufacturing pressure |
| --- | --- |
| Enables display functionality and must interface with the chip boundary | Adds an I/O component input and contributes to assembly and packaging requirements |

Future I/O families could distinguish display, networking, storage, sensor, or general-purpose interfaces. They should create different package, testing, or input requirements rather than serving only as stat upgrades.

### Power and thermal components

The **Power Controller** (`PM-110`) provides 20 W of package power-delivery capacity. The **Heat Spreader** (`TH-110`) supports a 15 W thermal load. They are separate components because power headroom and thermal headroom create different product and manufacturing constraints.

| Product effect | Manufacturing pressure |
| --- | --- |
| Reduces local heat when appropriately placed | Adds a component input and assembly cost while reducing thermal test time and reject risk |

This is an important push-and-pull choice: paying for cooling on the chip side may avoid spending on additional test capacity or losing expensive attempted units.

## Connections

Connections represent communication between functional parts. Their traffic, distance, capacity, and congestion affect both product performance and manufacturability.

### Required starter connections

- CPU to memory: heavy traffic.
- CPU to display I/O: light traffic.
- Display I/O to memory: medium traffic.

### Connection types

| Type | Product effect | Manufacturing pressure |
| --- | --- | --- |
| Standard Connection (`DL-110`) | 16 GB/s baseline capacity; distance or traffic may limit sustained performance | Low material, bonding, and inspection workload |
| Wide Connection (`DL-130`) | 32 GB/s capacity and greater sustained-performance potential | Higher material cost, power, bonding work, and inspection workload |

Crowded or complex routing should increase process and inspection workload. Connections therefore create factory pressure even when they do not add a dedicated machine.

## Manufacturing-profile contribution

Each final-chip part contributes to a manufacturing profile with the following categories:

| Category | Example |
| --- | --- |
| Bill of materials | One Dual-Core Processor, 1 GB LPDDR Memory, Display Controller, Power Controller, and Heat Spreader |
| Quality requirement | A demanding product may require higher-grade Quad-Core Processor or 2 GB LPDDR Memory supply |
| Process workload | A Quad-Core Processor and complex links increase placement or bonding time |
| Inspection workload | Complex routing or advanced components require more inspection |
| Test workload | Heat and high-performance parts increase test time |
| Yield risk | Heat raises test rejects; complexity raises inspection rejects |
| Packaging pressure | I/O count or package choice changes packaging work |
| Transport demand | Additional component types and quantities require more inbound movement |

The profile describes what production must handle, not which factory layout the player must build.

## Supplier and internal variants

A required component module may be sourced from a supplier or an internal factory. Source changes economics and risk without changing the functional role expected by the final-chip design.

Potential source attributes include:

- purchase or internal unit cost;
- quality grade;
- expected defect rate;
- maximum supply rate;
- lead time or reliability;
- compatibility with particular final-chip designs.

The final-chip factory should be able to consume compatible purchased and internal components through the same input requirement.

## Legacy prototype mapping

The current browser spike still uses generic names. Until it is updated, interpret them as:

| Prototype name | Full-game starter model |
| --- | --- |
| Efficient CPU | Dual-Core Processor (`CP-110`) |
| Fast CPU | Quad-Core Processor (`CP-130`) |
| Standard memory | 1 GB LPDDR Memory (`MD-110`) |
| Fast memory | 2 GB LPDDR Memory (`MD-130`) |
| Display I/O | Display Controller (`IO-110`) |
| Cooling / power | Temporary combination of Power Controller (`PM-110`) and Heat Spreader (`TH-110`) |
| Standard connection | Standard Connection (`DL-110`) |
| Express connection | Wide Connection (`DL-130`) |

The prototype's response statistic should eventually be replaced by raw compute, sustained compute, memory capacity, effective bandwidth, power headroom, and thermal headroom.

## Design requirements

- Every meaningful part or connection choice must affect product value, manufacturing pressure, or both.
- A higher-performing part must not be universally better after component cost, factory workload, yield, and opportunity value are considered.
- Placement must matter through understandable effects such as distance, heat, congestion, or package access.
- Part requirements must remain traceable in the factory's input, workload, quality, and cost displays.
- Internal component production must not turn component modules into additional final-chip design boards.

## Expansion candidates

Potential future part families include accelerators, storage, security, wireless, power management, and additional I/O. They should be added only when they create a distinct product capability and a meaningful manufacturing or factory decision.
