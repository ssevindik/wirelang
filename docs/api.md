# API Reference

This page documents commonly used functions and Schematic/Circuit APIs seen in the repository examples.

## Quick Start

Install, build and run examples:

```bash
npm install
npm run build
npm run example
```

## Creating Circuits

- `Circuit(name: string, ...elements)` — create a circuit. Elements can be components or nested arrays describing connections.
- `createSchematic(name?: string)` — create an empty `Schematic` container.
- `Series(...components)` / `Parallel(...components)` — topology helpers that return a structure that can be applied to a schematic.

Example

```ts
import { Circuit, Series, DC, R, GND } from '../core';

const c = Circuit('Simple', Series(DC(5), R(1000), GND()));
```

## Schematic Methods (examples used in repo)

- `s.addComponents(...components)` — add components to schematic `s`.
- `s.createNode(name)` — create a named node.
- `s.connect(pinA, pinB)` — connect pins or nodes.
- `s.getSummary()` — return a short textual summary of the schematic.
- `s.validate()` — return an object `{ valid: boolean, errors: string[], warnings: string[] }`.

## Component Factories

See `docs/components.md` for groups. Most factories are simple functions, e.g. `R(value)`, `C(value)`, `D(model?)`, `OpAmp(name?)`, `NOT()`.

## Examples & Patterns

- Use `applyToCircuit(s, topology)` to apply `Series`/`Parallel` results to a schematic (used in `core/examples.ts`).
- For complex topologies (e.g. bridge rectifier) create nodes and connect pins manually.
