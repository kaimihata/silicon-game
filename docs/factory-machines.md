# Factory machines

**Status:** Core machine roles are established by the greybox; full-game capabilities, recipes, and progression remain under design.

This document defines the machine and logistics roles used to produce component modules and final chips. See [Game design](game-design.md) for the overall loop, [Machine and capability progression](machine-progression.md) for the proposed unlock structure, [Chip parts](chip-parts.md) and [Component catalog](component-catalog.md) for product inputs, and [Manufacturing metrics](manufacturing-metrics.md) for provisional capacities.

## Factory purpose

Factories convert purchased or internally produced inputs into component modules and final chips. The first complete game should model one expandable campus containing several production departments. That campus may:

- manufacture a component used by other factories;
- assemble a final chip;
- inspect, test, package, store, or ship products;
- handle rejects or byproducts;
- share capacity among several production lines.

The same production rules should apply whether the output is a memory module, thermal part, substrate, or final chip. Multiple independent sites and freight between them are deferred until the one-campus game proves sufficiently deep.

## Machine model

Machines should expose a consistent set of production properties:

- footprint and orientation;
- input and output ports;
- supported capabilities or recipes;
- cycle time and throughput;
- input and output buffers;
- capital and operating cost;
- quality, yield, or reliability modifiers;
- power, staffing, cleanroom, or maintenance requirements where those systems are included.

A machine processes only when its recipe inputs are available and its outputs have somewhere to go.

## Core machine families

### Receiving and input

Receiving brings purchased materials or component modules into the factory.

Full-game receiving should distinguish item types and sources. A supplier delivery may have a price, quality, rate, and reliability rather than acting as an unlimited generic input.

### Transport

Transport moves typed items between machines and storage.

The current greybox uses generic bidirectional tracks. The full factory design should test:

- directional conveyors or enclosed wafer transport;
- finite throughput;
- visible item types;
- splitters, mergers, and filters;
- input and output port alignment;
- blocked and starved flow.

Transport cost and space make component count and factory shape economically meaningful.

### Die placement and assembly

The **Chip Assembler** (`ASM-100`) positions compute, memory, I/O, and power dies on a package substrate. More dies and physically demanding components increase placement workload.

### Interconnect bonding

The **Connection Station** (`BND-100`) creates the selected die-to-die links. Wider links, long routes, and congested layouts increase bonding time and inspection pressure.

The current generic `Process` machine combines die placement and bonding.

### Inspection

The **Quality Scanner** (`INS-100`) identifies placement, surface, and visible connection defects and produces either an inspected package or a reject.

Complex routing, advanced parts, and difficult component recipes may increase inspection time or reject probability. Inspection can be shared across lines, making it a reusable capability and a potential network bottleneck.

Later products may require an **X-ray Scanner** (`XRY-100`) for hidden connections or dense multi-chip packages.

### Electrical and thermal test

The **Chip Tester** (`TST-100`) verifies compute, memory, I/O, power, and connection behavior and produces either a validated package or a test reject.

Heat, component quality, reliability, and product complexity may increase test duration or failure probability. Component modules and final chips may require different test capabilities.

Later high-reliability products may require a separate **Stress Tester** (`BRN-100`).

### Package completion

The **Packaging Station** (`PKG-100`) applies protection and thermal package components to create a shippable product.

Final-chip I/O and package requirements may alter packaging inputs, cycle time, or machine capability. Internally consumed components may need protective or transport packaging different from externally sold components.

### Storage and buffering

Storage separates production rates, protects final assembly from supplier interruptions, and allows internal component factories to serve multiple products.

Buffers should have finite space and inventory cost so they solve variability without removing all production pressure.

### Shipping and output

Shipping sends accepted final chips or saleable excess components out of the factory. Only accepted products create their associated sale or contract revenue.

### Reject handling

Inspection and test rejects are physical outputs. The greybox routes them to garbage. Full-game progression may introduce recycling or rework, but failed units must never disappear or count as accepted production.

## Current greybox machine set

| Machine | Prototype role | Prototype capital cost |
| --- | --- | ---: |
| Design Kit Dock | Supplies the submitted design's aggregate component kit | $1,500 |
| Process | Converts kits into fabricated wafers | $7,000 |
| Memory Fabricator | Optionally replaces the kit's purchased memory with internal production | $9,000 |
| Inspection | Produces inspected wafers or rejects | $5,000 |
| Test | Produces validated wafers or rejects | $4,500 |
| Packaging | Produces accepted packaged chips | $4,000 |
| Garbage | Receives inspection and test rejects | $500 |
| Output bay | Ships accepted chips | $1,500 |
| Track | Connects adjacent stages | $200 |

The current required route is:

```text
design kit dock -> process -> inspection -> test -> packaging -> output
                                  |             |
                                  +-> garbage <-+

optional memory fabricator ---+
```

The submitted chip design determines the dock's kit contents and purchase cost. A Memory Fabricator connected to Process replaces purchased memory with the catalog's internal variable cost. This is a useful bridge toward typed inputs, but it remains too aggregated and linear to represent the intended full-game factory network.

## Full-game starter machine names

| Player-facing name | Internal model | Function |
| --- | --- | --- |
| Delivery Dock | `RCV-100` | Introduces purchased typed components |
| Conveyor | `LOG-100` | Moves one typed item stream |
| Component Storage | `BUF-100` | Stores and meters typed components |
| Chip Assembler | `ASM-100` | Places chiplets and dies onto substrates |
| Connection Station | `BND-100` | Creates die-to-die links |
| Quality Scanner | `INS-100` | Detects placement and visible connection defects |
| Chip Tester | `TST-100` | Validates final electrical behavior |
| Packaging Station | `PKG-100` | Completes the physical package |
| Scrap Collector | `SCR-100` | Receives rejected items |
| Shipping Dock | `SHP-100` | Ships accepted products |

These are generation-one machine models. Later machines can add speed, larger buffers, advanced capabilities, quality improvements, or lower operating costs without renaming the production roles.

## Current browser vertical-integration experiment

The next greybox should retain a final-chip line while introducing typed purchased inputs:

```text
purchased CPU module ------+
purchased memory module ---+
purchased I/O module ------+-> final assembly -> inspection -> test -> packaging
purchased cooling module --+
interconnect kits ----------+
```

It should then allow memory to come from an internal line:

```text
silicon wafer + memory substrate
    -> memory fabrication
    -> memory inspection
    -> internal memory module
    -> final assembly
```

Purchased memory remains compatible with final assembly and can merge with internal memory output. This browser experiment tests partial integration, supplier backup, shared flow, capital cost, and the complexity-versus-margin decision without requiring a complete upstream production tree. It does not lock memory as the first integration branch in the full campaign.

## Distinct component-line characteristics

Component factories should create different production problems rather than reuse identical chains with renamed outputs.

| Component family | Intended factory character |
| --- | --- |
| Thermal | Continuous forming and finishing, bulky inputs, high transport volume, recyclable offcuts |
| Memory | Wafer batches, parallel output, spatial yield variation, speed and quality bins |
| Substrate / interconnect | Panel nesting, offcuts, trace complexity, and shared X-ray inspection |
| I/O | Many lower-volume recipes, costly changeovers, and interface-specific test fixtures |
| Power management | Long analog batches, efficiency grades, reliability qualification, and burn-in |
| CPU | Expensive low-volume wafers, early metrology, performance binning, and valuable lower-grade output |
| Final chip | Converges selected component streams and inherits their quality, timing, and workload pressures |

Two branches should not be implemented as the same machine chain with different constants. Each branch must differ on at least three of: flow topology, process cadence, quality model, output grades, setup pressure, physical pressure, and recovery options.

## Proposed first-release campus scope

The first complete game should support internal production for:

1. **Thermal components:** the accessible introduction to vertical integration and bulky logistics.
2. **Memory:** the first wafer branch, centered on batch yield, parallel output, and binning.
3. **Substrates and interconnects:** panel allocation, material waste, routing precision, and advanced inspection.

I/O, power-management, and compute components remain purchasable in the first release. Their internal-production branches are documented as later expansion candidates. Advanced packaging can still be part of the first release because it changes final-chip assembly and does not require internal die fabrication.

## Shared capacity and network design

Nonlinear factories emerge when production lines interact within the campus:

- several final products draw from one memory line;
- component and final-chip products share inspection or packaging;
- supplier inputs and internal outputs merge;
- one transport corridor carries competing item types;
- storage buffers one line while starving another;
- excess internal production is stored or sold;
- reject handling consumes space and transport capacity.

Players should be able to create compact dedicated departments, flexible shared facilities, or hybrids with different costs and risks. Multi-site freight can extend this model later but is not needed for the first release.

## Factory-state feedback

The factory must explain its behavior through visible states:

- missing input type;
- starved machine;
- blocked output;
- transport saturation;
- machine utilization;
- active bottleneck;
- reject reason and destination;
- purchased versus internal unit consumption;
- cost and accepted output over time.

Selecting a machine or item should reveal which chip designs, recipes, or suppliers are creating its demand.

## Design requirements

- Items transported through the factory must have explicit types.
- Chip design affects factory demand but does not dictate placement.
- Machines require physical input and output paths.
- Purchased and internal versions of compatible components can feed the same recipe.
- Internal production has capital, operating, space, and yield consequences.
- Inspection and test rejects remain physical streams.
- Shared machines and routes can create both efficiency and contention.
- Factory layouts must be diagnosable without relying on hidden formulas or debug output.

## Open design questions

- Which machine capabilities are universal and which require specialized buildings.
- Whether supplier deliveries enter through dedicated docks, configurable receiving bays, or a logistics network.
- How conveyors handle mixed item types and prioritization.
- Which component recipes should be simulated in detail first.
- How storage cost, spoilage, lead time, power, staffing, maintenance, and cleanroom constraints enter progression.
- When reject recycling or rework becomes available and how it competes with new production.
