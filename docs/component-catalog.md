# Component catalog

**Status:** Provisional starter catalog for design and balance experiments.

This catalog gives chiplet components scalable names and quantitative specifications. The values are intentionally simple enough to use in the browser spike and are expected to change during balancing.

See [Chip parts](chip-parts.md) for design roles, [Manufacturing metrics](manufacturing-metrics.md) for derived behavior, and [Factory machines](factory-machines.md) for production equipment.

## Physical model

The player's final product is a multi-chip package or system-in-package assembled from purchased or internally manufactured dies and package components.

The design board represents placement inside the package:

- compute chiplets;
- memory dies;
- I/O chiplets;
- power-management dies;
- thermal components;
- die-to-die connections.

This makes purchased CPU and memory inputs physically meaningful while allowing later vertical integration into their production.

## Naming convention

Player-facing names lead with recognizable specifications. Internal catalog IDs appear as secondary labels for data, suppliers, recipes, and technology generations.

Examples:

- **Dual-Core Processor** (`CP-110`)
- **1 GB LPDDR Memory** (`MD-110`)
- **Display Controller** (`IO-110`)

The interface should not require players to memorize catalog IDs.

Catalog IDs use a family prefix and model number:

| Prefix | Family |
| --- | --- |
| `CP` | Compute chiplet |
| `MD` | Memory die |
| `IO` | Interface chiplet |
| `PM` | Power-management die |
| `TH` | Thermal package component |
| `DL` | Die-to-die link technology |

The first model-number digit represents a technology generation. Higher numbers within a generation identify different capabilities, not automatic upgrades. Supplier names and quality grades can later be attached to the same compatible specification.

## Starter compute chiplets

| Specification | Dual-Core Processor (`CP-110`) | Quad-Core Processor (`CP-130`) |
| --- | ---: | ---: |
| Generation | 1 | 1 |
| CPU cores | 2 | 4 |
| Clock speed | 1.6 GHz | 1.8 GHz |
| Architecture factor | 1.0 | 1.0 |
| Compute rating | 32 | 72 |
| Memory-bandwidth demand | 8 GB/s | 20 GB/s |
| Typical power | 5 W | 11 W |
| Die area | 18 mm² | 30 mm² |
| Prototype package footprint | 2x2 | 2x2 |
| Supplier price | $16 | $28 |
| Internal variable-cost target | $10 | $17 |

Compute rating is a game-facing comparison value derived from cores, clock speed, and architecture. CP-130 is still a basic generation-one component; it is not named "fast" because later generations may outperform it through clock speed, architecture, core count, or efficiency.

## Starter memory dies

| Specification | 1 GB LPDDR Memory (`MD-110`) | 2 GB LPDDR Memory (`MD-130`) |
| --- | ---: | ---: |
| Generation | 1 | 1 |
| Capacity | 1 GB | 2 GB |
| Peak bandwidth | 12.8 GB/s | 25.6 GB/s |
| Typical power | 1.5 W | 3 W |
| Die area | 14 mm² | 24 mm² |
| Prototype package footprint | 1x3 | 1x3 |
| Supplier price | $10 | $20 |
| Internal variable-cost target | $6 | $12 |

MD-130 provides both capacity and bandwidth, but costs more, consumes more power, and creates greater inspection and test workload.

## Starter I/O chiplet

| Specification | Display Controller (`IO-110`) |
| --- | ---: |
| Generation | 1 |
| Display pipelines | 1 |
| External link capacity | 12 Gb/s |
| Maximum target mode | 4K at 60 Hz |
| Typical power | 2 W |
| Die area | 10 mm² |
| Prototype package footprint | 1x2 |
| Supplier price | $5 |
| Internal variable-cost target | $3 |

Future I/O families may support networking, storage, sensors, additional displays, or general-purpose expansion. Their specifications should create different testing, package-edge, and interconnect demands.

## Starter power and thermal components

| Specification | Power Controller (`PM-110`) | Heat Spreader (`TH-110`) |
| --- | ---: | ---: |
| Function | Package power delivery | Package heat removal |
| Rated capacity | 20 W | 15 W thermal load |
| Conversion efficiency | 92% | Not applicable |
| Active power | 0.8 W | 0 W |
| Die or component area | 6 mm² | 24 mm² coverage |
| Prototype package footprint | 1x1 | 2x1 |
| Supplier price | $4 | $4 |
| Internal variable-cost target | $2.50 | $2 |

The browser prototype currently combines cooling and power into one part. The full-game model separates them because power-delivery capacity and thermal capacity create different constraints.

## Starter die-to-die links

| Specification | Standard Connection (`DL-110`) | Wide Connection (`DL-130`) |
| --- | ---: | ---: |
| Generation | 1 | 1 |
| Link bandwidth | 16 GB/s | 32 GB/s |
| Link power | 0.5 W | 1.2 W |
| Supplier material cost per link | $1 | $5 |
| Bonding workload | 1 unit | 2 units |
| Inspection workload | 0.5 units | 1.5 units |
| Prototype relationship | Standard | Express |

A connection's effective bandwidth may also be reduced by distance, congestion, or incompatible endpoint capability.

## Manufacturing workload contributions

Workload units convert component complexity into machine time without pretending that one game second represents one literal industrial operation.

| Component | Placement work | Inspection work | Electrical-test work |
| --- | ---: | ---: | ---: |
| Dual-Core Processor (`CP-110`) | 2 | 2 | 3 |
| Quad-Core Processor (`CP-130`) | 3 | 4 | 6 |
| 1 GB LPDDR Memory (`MD-110`) | 1 | 1 | 2 |
| 2 GB LPDDR Memory (`MD-130`) | 1.5 | 2 | 4 |
| Display Controller (`IO-110`) | 1 | 1.5 | 1.5 |
| Power Controller (`PM-110`) | 1 | 1 | 1 |
| Heat Spreader (`TH-110`) | 1 | 0.5 | 0 |

Links add bonding and inspection workload separately. Thermal headroom modifies test workload and reject probability rather than giving TH-110 negative work.

## Supplier variants

The catalog describes compatibility specifications, not individual supplier products. A supplier offer can vary:

- unit price;
- quality grade and defect probability;
- maximum delivery rate;
- lead time;
- contract duration;
- minimum order;
- reliability.

Two suppliers may therefore sell compatible CP-110 chiplets with different economics and quality.

## Internal production

Internal factories produce items compatible with these catalog specifications. Internal variable-cost targets are not guaranteed prices: actual cost depends on utilization, material price, yield, power, and rejected output.

An internal component may also have a quality grade. Lower-quality output can remain usable but increase final-package inspection, test time, or reject risk.

## Expansion examples

The catalog can grow without renaming starter components:

- CP-210 compute chiplets with a newer architecture factor;
- CP-150 many-core parts with lower clocks but higher parallel throughput;
- MD-210 higher-density memory;
- IO-130 dual-display or networking interfaces;
- PM-130 higher-capacity power controllers;
- TH-130 vapor-chamber cooling;
- DL-210 links with more bandwidth or lower power.
