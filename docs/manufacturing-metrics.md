# Product and manufacturing metrics

**Status:** Provisional calculation model for design experiments.

This document defines how component specifications influence product eligibility, price opportunities, factory speed, cost, and yield. Values should remain data-driven and adjustable during balancing.

See [Component catalog](component-catalog.md), [Chip parts](chip-parts.md), and [Factory machines](factory-machines.md).

## Product metrics

### Raw compute rating

```text
raw compute = sum(cores x clock GHz x architecture factor x 10)
```

The rating is a readable gameplay index, not a claim that unlike processor architectures can be compared perfectly by clock speed.

### Memory

```text
memory capacity = sum(memory-die capacity)
raw memory bandwidth = sum(memory-die bandwidth)
effective memory bandwidth = minimum(raw memory bandwidth, connected link bandwidth)
```

Compute chiplets also specify bandwidth demand. A design that cannot feed its compute dies loses sustained performance even if its raw compute rating is high.

### Sustained compute

```text
bandwidth supply ratio =
  minimum(1, effective memory bandwidth / total compute bandwidth demand)

sustained compute = raw compute x bandwidth supply ratio
```

Later architectures may add cache, workload type, latency, or parallelism, but the first model should keep the bottleneck understandable.

### Power and thermal load

```text
package power =
  sum(component power) + sum(link power)

power headroom =
  power-controller capacity - package power

thermal headroom =
  thermal-component capacity - package power
```

Insufficient power capacity blocks submission. Low or negative thermal headroom increases electrical-test work and reject probability.

### Product value

Sale price should primarily come from markets or contracts with explicit requirements, rather than a universal formula.

An opportunity may require:

- minimum sustained compute;
- minimum memory capacity;
- minimum memory or I/O bandwidth;
- particular interfaces;
- maximum power;
- minimum expected reliability;
- quantity and delivery rate.

More capable designs can qualify for higher-value opportunities, but unused capability receives no automatic payment.

## Manufacturing workloads

Each component and connection contributes work to production stages:

- placement work;
- bonding work;
- inspection work;
- electrical-test work;
- packaging work.

Layout and product conditions add modifiers:

- long or crowded links increase bonding and inspection work;
- high die count increases placement work;
- low thermal headroom increases test work;
- poor incoming component quality increases inspection and test risk;
- advanced package requirements increase packaging work.

## Machine cycle time

Each machine has a setup time and a processing capacity measured in workload units per second.

```text
machine cycle seconds =
  setup seconds + required workload / machine capacity
```

Parallel compatible machines divide the workload reaching that stage when transport and buffers distribute items successfully.

## Provisional starter machine values

| Machine | Setup | Capacity | Nominal buffer | Capital cost |
| --- | ---: | ---: | ---: | ---: |
| Chip Assembler (`ASM-100`) | 2 s | 2 placement units/s | 4 packages | $7,000 |
| Connection Station (`BND-100`) | 1.5 s | 1.5 connection units/s | 4 packages | $6,000 |
| Quality Scanner (`INS-100`) | 2 s | 1.25 inspection units/s | 6 packages | $5,000 |
| Chip Tester (`TST-100`) | 2 s | 1.5 test units/s | 6 packages | $4,500 |
| Packaging Station (`PKG-100`) | 1 s | 0.33 packages/s | 4 packages | $4,000 |
| Conveyor (`LOG-100`) | None | 1 item/s | 1 item/cell | $200/cell |

These values establish relative behavior only. They should be tuned against target factory sizes, contract volumes, and desired session pacing.

## Throughput

For a stable line, the slowest effective stage determines attempted packages per minute:

```text
attempts per minute = 60 / largest effective cycle time

accepted per minute = attempts per minute x total yield
```

Real factory output may be lower if material delivery, conveyor capacity, buffer size, machine blocking, or starvation prevents stable operation.

## Yield

Yield should be separated into understandable failure sources:

```text
assembly yield
  x inspection pass rate
  x electrical-test pass rate
  x packaging yield
  = accepted yield
```

Potential modifiers include:

- supplier or internal component quality;
- die count;
- bonding complexity;
- route congestion;
- power headroom;
- thermal headroom;
- machine capability and condition.

Rejected units retain all component and processing cost already invested in them.

## Cost

### Purchased bill of materials

```text
purchased component cost =
  sum(quantity consumed x supplier unit price)
```

### Internal component cost

```text
internal component cost =
  material cost
  + operating cost
  + reject loss
  + allocated logistics cost
```

Capital cost is reported separately and may be amortized for planning views. This avoids hiding the difference between cash investment and ongoing unit cost.

### Final unit economics

```text
cost per attempt =
  purchased component cost
  + internal component cost
  + final assembly operating cost

expected cost per accepted chip =
  cost per attempt / accepted yield

margin per accepted chip =
  sale price - expected cost per accepted chip

profit per minute =
  accepted per minute x margin per accepted chip
```

These calculations make speed and cost simultaneous concerns. Adding machinery may improve profit per minute while temporarily worsening cash position or capital efficiency.

## Starter opportunity examples

These are comparison targets, not final contract balance.

| Opportunity | Minimum sustained compute | Memory | Memory bandwidth | Required I/O | Maximum power | Price |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Basic display controller | 28 | 1 GB | 8 GB/s | One display pipeline | 16 W | $100 |
| Enhanced display controller | 60 | 2 GB | 20 GB/s | One display pipeline | 22 W | $155 |

The basic design should be easier and cheaper to manufacture. The enhanced design should earn more per accepted unit while applying enough factory pressure that it is not automatically more profitable.

## Required UI explanations

The chip designer should show:

- raw and sustained compute;
- memory capacity and effective bandwidth;
- package power and thermal headroom;
- expected manufacturing workloads;
- expected yield and unit economics;
- opportunities the design qualifies for.

The factory should show:

- required and missing input types;
- stage workload and installed capacity;
- starvation, blocking, and transport saturation;
- purchased versus internal component consumption;
- attempted and accepted output;
- observed yield, cost, and profit per minute.
