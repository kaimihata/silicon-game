# Candidate first user interaction

**Status:** Potential onboarding story and reference scenario for the next browser spike. It is intended for iteration, usability testing, and implementation planning rather than as locked final-game content.

See [Game design](game-design.md), [Chip parts](chip-parts.md), [Component catalog](component-catalog.md), [Factory machines](factory-machines.md), and [Manufacturing metrics](manufacturing-metrics.md).

## Purpose

The first interaction should teach the relationship between final-chip design and factory design without beginning with raw-material production.

The player should learn that:

- the chip design determines which purchased components the factory must physically handle;
- the design also determines assembly, connection, inspection, test, and packaging pressure;
- the player chooses the factory layout rather than receiving a blueprint;
- factory speed and unit cost can be improved through layout and capacity decisions;
- later vertical integration can replace a purchased component without replacing the final-chip design system.

## Scenario

The player runs a new chip company with no component fabrication capability. A customer offers an order for 1,000 basic display-controller packages.

The company can purchase all required chiplets and package components from established suppliers. The opportunity is intentionally achievable with a small assembly factory, but supplier margins leave visible room for future cost reduction.

The player begins by designing a qualifying final product, then builds the factory that assembles, connects, inspects, tests, packages, and ships it.

## Starter final-chip design

The suggested first design uses:

| Design item | Quantity | Purpose |
| --- | ---: | --- |
| Dual-Core Processor | 1 | Supplies the required compute capability |
| 1 GB LPDDR Memory | 1 | Supplies the required capacity and bandwidth |
| Display Controller | 1 | Provides the required display output |
| Power Controller | 1 | Supplies package power within the target limit |
| Heat Spreader | 1 | Provides sufficient thermal capacity |
| Standard Connections | 3 | Connect processor, memory, and display functions |

The factory recipe also consumes one package substrate and packaging material per attempted product.

The design screen should show recognizable product values:

- raw and sustained compute;
- 1 GB memory capacity;
- effective memory bandwidth;
- package power;
- thermal headroom;
- expected manufacturing workload;
- expected yield and cost per accepted product.

Submitting the design creates a production recipe and manufacturing-pressure profile, not a prescribed factory layout.

## Required production flow

```text
processor -----------+
1 GB LPDDR memory ---+
display controller --+-> Chip Assembler -> Connection Station
power controller ----+                          |
package substrate ---+                          v
                                           Quality Scanner -----> Scrap
                                                 |
                                                 v
                                           Chip Tester ---------> Scrap
                                                 |
heat spreader -----------------------------------+
packaging material ------------------------------+-> Packaging Station
                                                         |
                                                         v
                                                   Shipping Dock
```

After the Chip Assembler consumes the individual parts, downstream conveyors carry one work-in-progress package rather than separate processor and memory items.

## Reference layout

This is one readable solution for the scenario, not the only valid layout.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│ [Processor Dock] -> [Processor Storage] ─┐                               │
│ [Memory Dock] ----> [Memory Storage] ────┤                               │
│ [I/O Dock] -------> [I/O Storage] ───────┼──> [CHIP ASSEMBLER]           │
│ [Power Dock] -----> [Power Storage] ─────┤             │                 │
│ [Substrate Dock] -> [Substrate Storage] ─┘             v                 │
│                                                Unconnected Package       │
│                                                         │                │
│ [Connection Kits] --------------------------------------┼──> [CONNECTION │
│                                                         │      STATION]   │
│                                                         │         │       │
│                                                         │         v       │
│                                                         │  Bonded Package│
│                                                         │         │       │
│                                                         │         v       │
│                                                   [QUALITY SCANNER]      │
│                                                         │       │         │
│                                                  Reject ─┘       v Pass   │
│                                                     │      [CHIP TESTER] │
│                                                     │        │       │    │
│                                                     │ Reject ┘       v    │
│                                                     v                    │
│                                             [SCRAP COLLECTOR]            │
│                                                                  │       │
│ [Heat Spreader Dock] --------------------------------------------+       │
│ [Packaging Material] --------------------------------------------+       │
│                                                                  v       │
│                                                        [PACKAGING STATION]│
│                                                                  │       │
│                                                                  v       │
│                                                          [SHIPPING DOCK] │
└──────────────────────────────────────────────────────────────────────────┘
```

## Machine inputs and outputs

| Machine | Required inputs | Main output | Reject output |
| --- | --- | --- | --- |
| Chip Assembler | Processor, memory, display controller, power controller, substrate | Unconnected package | None |
| Connection Station | Unconnected package, three connection kits | Bonded package | None |
| Quality Scanner | Bonded package | Inspected package | Defective package |
| Chip Tester | Inspected package | Validated package | Failed package |
| Packaging Station | Validated package, heat spreader, packaging material | Finished display controller | None |
| Shipping Dock | Finished accepted product | Contract delivery | None |
| Scrap Collector | Inspection and test rejects | Stored scrap | None |

## Intended player journey

1. **Read the opportunity.** The player sees the required compute, memory, display, power, quantity, and sale price.
2. **Create the final-chip design.** The suggested components qualify, and each selection updates product and manufacturing values.
3. **Review the manufacturing profile.** The player sees the required purchased parts and work at each production stage.
4. **Enter an empty factory.** Supplier docks make the required parts available, but nothing is routed.
5. **Place the Chip Assembler.** Its input panel identifies every missing recipe item.
6. **Build component routes.** The player connects supplier docks directly or through storage to the assembler's feeder ports.
7. **Build downstream production.** The work-in-progress package moves through connection, scanning, testing, packaging, and shipping.
8. **Route rejects.** The line remains invalid until Quality Scanner and Chip Tester rejects can reach the Scrap Collector.
9. **Run production.** Moving item icons, machine states, and counters make starvation, blocking, rejects, cost, and accepted output visible.
10. **Improve the line.** The player shortens expensive routes, adds or removes storage, or increases the capacity of the active bottleneck.
11. **Revisit the chip.** A component or connection change alters input demand or stage workload and may require factory changes.
12. **Preview vertical integration.** The game identifies 1 GB LPDDR Memory as a costly purchased input that could later be produced internally.

## Early layout decisions

Even this small line should permit several approaches:

- dedicated component conveyors that are easy to understand but consume space;
- mixed component conveyors with filters that save space but can congest;
- direct delivery to the assembler with low capital but weak buffering;
- local Component Storage that costs space and money but prevents starvation;
- separate or merged reject conveyors;
- compact downstream machines that are cheap to connect but harder to expand;
- reserved expansion space for another Quality Scanner or Chip Tester.

The scenario should not require one exact arrangement.

## Required feedback

### Components and conveyors

- Every transported item has a readable name and distinct icon or color.
- Hovering a conveyor shows its current item type, rate, and destination.
- Selecting a component highlights its source, route, storage, consumer, and unit cost.
- Purchased and future internally produced 1 GB LPDDR Memory are compatible inputs.

### Machines

- Input ports show required item types and local inventory.
- Machines visibly report **Missing input**, **Working**, **Output blocked**, or **No recipe**.
- Selecting a machine explains which final-chip design and recipe create its workload.
- Quality Scanner and Chip Tester identify why units are rejected.

### Economics

- Supplier spending, operating cost, rejected-part loss, and revenue remain separate.
- The player can compare expected design values with observed factory results.
- Cost per accepted product, accepted products per minute, and profit per minute are visible together.

## Success criteria

The interaction succeeds when a new player can:

- explain why each delivered component is required by the chip design;
- build a valid input, production, reject, and shipping flow without hidden rules;
- identify whether a machine is starved, blocked, or overloaded;
- explain why rejected packages lose the value of their consumed components;
- make one layout change that improves throughput or cost;
- predict that changing the chip design will change factory demand;
- understand why producing memory internally could improve margin while increasing factory complexity.

## Suggested spike implementation scope

An agent updating the browser spike should focus on:

- typed component and work-in-progress items;
- a recipe generated from the submitted chip design;
- configurable delivery sources;
- directional conveyors with finite capacity;
- machine input and output ports;
- simple local machine buffers;
- visible starvation and blocking;
- physical inspection and test reject streams;
- supplier spending and accepted-unit economics;
- this one purchased-component scenario.

Internal memory production should be added only after the purchased-component flow is understandable. Its first version can merge internal 1 GB LPDDR Memory with purchased memory at the existing Memory Storage or assembler input. This remains a focused browser experiment; it does not imply that memory must precede thermal integration in the full game's campaign.

### Current bridge implementation

The current greybox now makes the submitted design's aggregate component kit explicit at the factory. The Design Kit Dock lists the selected parts and connection kits, shows their purchased cost per attempt, and updates whenever the chip is resubmitted. A connected Memory Fabricator replaces the purchased memory portion with its provisional internal variable cost.

This is an intentional intermediate step. It tests whether players understand recipe provenance and the make-versus-buy margin benefit before the factory simulation expands to separate typed deliveries and visible memory items.

## Open questions for iteration

- Whether the first scenario begins with preplaced supplier docks or asks the player to place and configure them.
- Whether mixed-item conveyors are available immediately or introduced after dedicated belts.
- How much of the reference layout is tutorial guidance versus player discovery.
- Whether Component Storage is optional in the first successful solution.
- Which downstream machine should be the first intentional bottleneck.
- How much money and floor space make direct routing, buffering, and expansion meaningfully different.
