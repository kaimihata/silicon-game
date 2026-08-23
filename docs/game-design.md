# Chip City game design

**Status:** Foundational design direction for the full game.

Chip City is a game about designing final chips and building the industrial network needed to manufacture them profitably. The current browser implementation is a greybox experiment for this loop, not the intended architecture or complete scope of the final game.

## Related design documents

- [Chip parts](chip-parts.md) defines the current functional blocks available in final-chip designs and how they create manufacturing pressure.
- [Component catalog](component-catalog.md) defines scalable model names and provisional physical and economic specifications.
- [Factory machines](factory-machines.md) defines the production and logistics roles used to manufacture components and final chips.
- [Product and manufacturing metrics](manufacturing-metrics.md) defines how component specifications affect eligibility, factory workload, throughput, yield, and cost.
- [Candidate first user interaction](first-user-interaction.md) describes a testable onboarding story and reference factory for the next spike.
- [Greybox build brief](../chip-city-greybox-spike-build-brief.html) specifies the current browser prototype.
- [Greybox verification plan](../chip-city-greybox-spike-verification.html) defines the current prototype's acceptance scenarios.

## Design premise

The player begins as a chip company that purchases sophisticated chiplets, memory dies, and package components from suppliers, combines them into multi-chip packages, and sells accepted products. Purchased components make it possible to start production without owning an entire semiconductor supply chain, but their prices include supplier margins.

Over time, the player may vertically integrate by building factories that produce selected components internally. Internal production can improve margins, quality control, or supply reliability, but adds capital cost, factory space, operating expense, yield risk, and logistical complexity.

Progression therefore runs backward through the supply chain:

```text
Start: purchased components -> final-chip production -> sold chips

Later: materials -> internal component production
                    -> final-chip production -> sold chips
```

The goal is not to eliminate suppliers automatically. The player continually decides what to buy, what to make, and how deeply to integrate.

## Core design pillars

### Coupled chip and factory optimization

Chip design and factory design are separate activities that continually affect one another.

- A simpler chip may qualify only for lower-value opportunities, but it can use cheaper components, require less machine capacity, produce less waste, and run through a compact factory.
- A more capable chip may sell for more or qualify for better contracts, but demand expensive components, additional material streams, tighter quality, more processing, or greater inspection and test capacity.
- A factory investment may make a previously unattractive chip design profitable.
- A chip redesign may remove the need for an expensive factory expansion.

Neither system should produce a single prescribed answer for the other.

### Reverse automation progression

Unlike production games that begin with raw resources and advance toward finished products, Chip City begins with finished component modules supplied by other companies. The player expands backward into component production when scale or strategy justifies it.

### Make, buy, or combine

A component requirement may be satisfied by:

- purchasing all units from suppliers;
- producing all units internally; or
- combining internal output with purchased units.

Partial integration and supplier backup are valid strategies. Internal production must not be automatically cheaper at every volume or quality level.

### Physical and readable causality

Meaningful chip choices must create visible factory consequences. Those consequences may affect:

- bill of materials;
- input types or quantities;
- transport demand;
- processing, inspection, test, or packaging workload;
- yield and reject streams;
- machine capability or quality requirements.

The player should be able to trace a factory pressure back to the chip choice that created it and trace a chip limitation back to relevant factory capability.

### Reusable production networks

Factories may produce final chips or intermediate component modules. Component factories should be able to:

- supply several final-chip products;
- share machines and logistics with other production lines;
- send excess output to storage or external sale;
- compete for common capacity;
- create bottlenecks elsewhere in the industrial network.

This reuse prevents every final-chip product from becoming another isolated linear factory.

### Economics alongside throughput

The player optimizes both unit economics and production speed. Important measures include:

- sale revenue;
- supplier spending;
- internal material and operating costs;
- capital invested;
- yield and reject loss;
- cost per accepted chip;
- accepted chips per minute;
- profit per minute.

A fast factory can be unprofitable, and a high-margin design can fail because it cannot be produced at useful volume.

## Core game loop

1. **Evaluate an opportunity.** Review performance, quantity, price, quality, and delivery expectations.
2. **Design a final chip.** Select and arrange functional parts and connections to create a product that can satisfy the opportunity.
3. **Review manufacturing pressure.** See required components, workload, expected yield, packaging needs, and economic estimates without receiving a prescribed layout.
4. **Choose sourcing.** Purchase components, use internal production, or combine both.
5. **Build or modify factories.** Route typed items through machines with appropriate capacity and quality.
6. **Run production.** Observe starvation, blocked outputs, bottlenecks, rejects, costs, throughput, and accepted output.
7. **Respond.** Redesign the chip, change suppliers, rebalance the factory, add capacity, or vertically integrate.
8. **Reuse and expand.** Apply existing component capacity and knowledge to later products.

## System boundaries

### Final-chip designer

The chip designer is used for the final products the company sells. It determines:

- functional capabilities and performance;
- selected component-module requirements;
- placement and connection consequences;
- heat, complexity, reliability, and package pressure;
- the product's manufacturing profile.

It does not provide an exact factory blueprint.

### Component production

CPU, memory, I/O, cooling, interconnect, and other component factories use production recipes and logistics. They do not repeat the final-chip design interface.

Component recipes define the materials, machine capabilities, cycle times, expected yield, and output quality needed to produce a component module.

### Manufacturing profile

The manufacturing profile is the interface between a final-chip design and production. It should describe pressure rather than prescribe topology:

- bill of materials and component quality requirements;
- work required at each production stage;
- expected defect and reject risks;
- transport volume;
- packaging requirements;
- estimated cost, yield, and throughput.

The player decides how to satisfy that profile through layout, sourcing, capacity, and process choices.

## Production model

Every manufactured item has a type, quantity, source, unit cost, and potentially a quality grade. Items may come from suppliers, internal factories, inventory, or returned production.

Machines transform items through recipes. A recipe identifies:

- required inputs;
- output item and quantity;
- compatible machine capability;
- cycle time;
- operating cost;
- expected yield or quality effects;
- reject or byproduct outputs.

Transport and storage are physical parts of production. Machines can become:

- **starved** when required inputs are unavailable;
- **working** while processing a recipe;
- **blocked** when output cannot leave;
- **under-capacity** or **overloaded** relative to downstream demand.

Inspection and test failures create real item streams. Rejects must be disposed of, recycled, or reworked where those systems are available.

## Progression shape

### Assembly company

The player buys nearly all component modules and learns final-chip design, routing, factory flow, quality, and contract economics.

### Selective integration

The player chooses a component family, such as memory, to manufacture internally. The new line introduces materials, dedicated processing, inspection, rejects, and competition for shared capacity.

### Networked producer

Internal component factories supply multiple final products. The player balances shared production, inventory, supplier backup, and external component sales.

### Deep integration

The company may expand toward more advanced components and upstream materials. Greater control and potential margin come with substantially harder production and capital decisions.

This is not intended to be a single mandatory sequence. Different products, contracts, suppliers, and factory strengths should make different integration paths viable.

## Design requirements

- The first chip design must visibly alter factory demand and economics.
- Every meaningful chip choice must affect at least one manufacturing-profile dimension.
- The manufacturing profile must explain pressure without prescribing a layout.
- Internal production must carry real capital, space, operating, and yield costs.
- Purchased and internal versions of a component must be able to coexist in one supply network.
- Component factories must have distinct logistical or process characteristics rather than differing only by numbers.
- Shared machines and routes must create opportunities for reuse and contention.
- Rejected units never satisfy final-product demand or create final-product revenue.
- Expected outcomes shown during design must remain distinguishable from observed production results.

## Current greybox experiment

The current browser spike validates a smaller loop:

```text
component kits -> process -> inspection -> test -> packaging -> accepted chips
```

It currently models components and production as aggregate counts, generic tracks, and a mostly fixed machine sequence. Its deterministic calculations and golden scenarios are useful baselines, but its static-web architecture and simplified factory are not full-game constraints.

The next experiment should add typed purchased component inputs and one optional internal component line, initially memory. This is the smallest useful test of reverse progression, hybrid sourcing, physical logistics, and the margin-versus-complexity decision.

## Open design questions

- Whether transported CPU and memory items are represented as chiplets, modules, licensed cores embodied in kits, or another abstraction.
- How far upstream the playable production tree eventually extends.
- How component quality and process variation affect final-chip performance and yield.
- How supplier pricing, reliability, lead times, and exclusivity change over time.
- Whether excess internal components can always be sold or require market demand.
- How much transport, power, staffing, cleanroom, maintenance, and inventory detail supports the core decisions without obscuring them.
