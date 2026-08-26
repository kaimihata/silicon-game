# Human and agent player protocol

**Status:** Proposed contract for games intended to support human and automated players.

## Purpose

The player protocol is the boundary between player intent and authoritative simulation. Human interfaces and semantic agents use different adapters, but both submit the same commands and receive information derived from the same state.

```text
mouse, keyboard, controller ----> human adapter ----+
                                                    |
semantic agent tools -----------> agent adapter ----+--> player commands
                                                    |         |
replay trace -------------------> replay adapter ----+         v
                                                      authoritative simulation
                                                               |
                                      +------------------------+------------------+
                                      |                        |                  |
                                 rendered UI          public observations    test oracle
```

The protocol is not a debug console. It cannot create resources, teleport entities, alter outcomes, or inspect hidden state unless the same capability is explicitly available to the human player.

## Command contract

Every meaningful mutation is a typed command. UI handlers collect intent and submit commands; they do not contain game rules.

```json
{
  "protocolVersion": 1,
  "commandId": "01H...",
  "actorId": "player-1",
  "expectedStateRevision": 184,
  "action": "place_entity",
  "arguments": {
    "catalogId": "machine.example",
    "position": {"x": 12, "y": 7},
    "rotation": 90
  }
}
```

Commands should be:

- semantic rather than expressed as screen coordinates;
- bounded to one player intention;
- validated atomically;
- safe to retry through a unique command identifier;
- rejected when based on a stale state revision;
- versioned and serializable;
- suitable for recording and replay.

The result explains both rejection and accepted effects:

```json
{
  "commandId": "01H...",
  "accepted": false,
  "stateRevision": 184,
  "error": {
    "code": "INSUFFICIENT_CLEARANCE",
    "message": "The entity requires one empty cell beside its output.",
    "relatedEntities": ["entity-22"],
    "locations": [{"x": 13, "y": 7}]
  }
}
```

Error codes are stable machine contracts. Messages are localized player-facing explanations. Agents must not be expected to parse prose to determine failure type.

## Observation contract

Public observations expose what a player can discover through normal interaction:

- available actions and why actions are disabled;
- visible entities with stable identifiers;
- catalog entries and player-known rules;
- selected entity details;
- current goals and progress;
- readable inventories, rates, costs, and statuses;
- recent events;
- changes since a requested state revision.

Observations should support focused queries and deltas. Repeatedly sending an entire world state is expensive, encourages accidental dependence on irrelevant details, and scales poorly.

```json
{
  "stateRevision": 185,
  "selection": {
    "entityId": "entity-22",
    "name": "Example machine",
    "status": "OUTPUT_BLOCKED",
    "availableActions": ["move", "rotate", "remove", "inspect_output"]
  },
  "recentEvents": [
    {
      "type": "entity_placed",
      "entityId": "entity-22",
      "causedBy": "01H..."
    }
  ]
}
```

The protocol should distinguish:

- **public observations**, available to semantic agents and represented in the human UI;
- **accessibility semantics**, labels and relationships attached to rendered controls;
- **telemetry**, aggregated measurements collected under policy;
- **oracle state**, privileged test-only truth used to evaluate outcomes.

Oracle state must never leak into the player adapter.

## Events and causality

The simulation emits stable domain events for meaningful outcomes. Events identify their originating command, simulation tick, affected entities, and relevant values.

This supports:

- readable feedback for humans;
- concise change observations for agents;
- causal debugging;
- analytics;
- tutorial triggers;
- replay visualization;
- automated evaluation.

Transient animation events should be derived from domain events. Animation completion must not determine authoritative outcomes unless timing is itself an intentional mechanic.

## Time control

Simulation time must be explicit:

- fixed simulation ticks;
- pause and resume commands;
- approved speed settings;
- deterministic headless stepping;
- a clear distinction between simulation time and wall-clock time.

Semantic playtests may run faster than real time, but speed cannot change outcomes. Human-facing cooldowns or timing constraints remain part of the command rules.

## Player adapters

### Human adapter

The human adapter maps mouse, keyboard, controller, touch, and accessibility actions to protocol commands. It renders public observations and domain events as visuals, sound, text, animation, and haptics.

Controls should expose semantic names, roles, values, disabled reasons, and associated entity identifiers. This improves human accessibility and lets black-box automation correlate controls with rendered entities.

### Semantic-agent adapter

The semantic adapter exposes a small tool surface:

- list or inspect known objects;
- request available actions;
- submit one command;
- observe changes;
- inspect current goals;
- save or restore an allowed scenario snapshot.

High-level tools must not solve strategy for the agent. For example, `place_entity` is appropriate; `build_optimal_factory` is not a player action.

### Black-box adapter

The black-box adapter provides rendered frames, audio or captions where needed, accessibility semantics, and ordinary input controls. It does not call semantic game commands directly.

Black-box agents validate discoverability and presentation. Their results should not replace deterministic or semantic correctness checks.

## Replay format

A replay contains:

- game and protocol versions;
- content and scenario revisions;
- initial snapshot or scenario identifier;
- random seed;
- ordered accepted and rejected commands;
- authoritative state hashes at checkpoints;
- optional rendered captures and annotations.

Rejected commands are useful evidence of confusion and should remain in user-research and black-box traces, even though they do not change state.

Replays require migration or explicit incompatibility handling when command semantics change. Silent reinterpretation is prohibited.

## Design requirements

- Every human mutation maps to a protocol command.
- Every semantic-agent command can be performed through a supported human interaction.
- Player-facing states use consistent names in simulation, UI, logs, and observations.
- Critical information is never communicated only through color, sound, or animation.
- Stable identifiers outlive selection and rendering objects.
- Coordinates and units have one documented convention.
- Actions report precise failure reasons.
- The game can run deterministically without rendering.
- A saved command trace can reproduce a run from a known revision and seed.
- Test-only commands and oracle queries are compiled out of or inaccessible in release play.

## Compatibility tests

Each command type should have contract tests proving:

- human and semantic adapters produce equivalent commands;
- valid commands produce the same outcome in headless and rendered modes;
- invalid commands return the same error code;
- command serialization round-trips;
- replay produces expected checkpoint hashes;
- old protocol versions migrate or fail explicitly.
