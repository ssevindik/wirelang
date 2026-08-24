# WireScript

A **code-first DSL** for describing electronic circuits in TypeScript.

> ⚠️ Early experimental stage — API may change before stable release.

---

## Install

```sh
npm install @ssevindikx/wirescript
```

## Quick Start

```ts
import { Circuit, DC, R, LED, GND, RED, runERC } from '@ssevindikx/wirescript';

// Describe the circuit
const circuit = Circuit('LED Driver',
  DC(5),     // 5 V source
  R(330),    // 330 Ω current-limiting resistor
  LED(RED),  // Red LED
  GND()      // Ground reference
);

// Validate
const erc = runERC(circuit);
console.log(erc.report()); // ✅ ERC passed — no violations found.

// Inspect
console.log(circuit.getSummary());
```

Get the resistor wrong and the check tells you exactly what and why:

```ts
Circuit('Bare LED', { autoGround: false }, [
  [VCC(12), led.anode],
  [led.cathode, GND()],
]);
```

```
🔴 ERRORS (2)
  [ERC_SUPPLY_SHORT] Net "node_1" (12V) reaches ground through LED1 with zero
                     series resistance. This shorts the supply.
      ↳ Add a current-limiting resistor in this path.
  [ERC_NO_CURRENT_LIMIT] LED1: forward-biased across 12V with zero series
                     resistance. Forward current is limited only by the supply —
                     the LED will be destroyed.
      ↳ Add a series resistor. For 12V and Vf=1.8V at 10mA, use about 1.02kΩ.
```

For multi-pin components (transistors, op-amps):

```ts
const t = NPN('2N2222');

Circuit('BJT Switch', [
  [DC(5), R(kOhm(1)), LED(RED), t.C],
  [t.E, GND()],
  [DC(5), R(kOhm(10)), t.B],
]);
```

---

## Documentation

| Guide | Description |
|---|---|
| [Getting Started](./docs/getting-started.md) | Install, quick start, two API styles |
| [DSL API](./docs/api-dsl.md) | Declarative syntax — `Circuit`, `Series`, `Parallel` |
| [TypeScript API](./docs/api-typescript.md) | Imperative API — `createSchematic`, manual wiring |
| [Components](./docs/components.md) | All built-in components with parameters |
| [Units](./docs/units.md) | SI prefix helpers — `kOhm`, `uF`, `MHz`, … |
| [ERC](./docs/erc.md) | Electrical Rule Check — physics-based validation |
| [Serialization](./docs/serialization.md) | JSON IR, DSL ↔ DB round-trip |
| [CLI](./docs/cli.md) | Command-line interface |
| [Examples](./docs/examples.md) | 12 ready-to-run circuit examples |

---

## Features

- **DSL API** — Declarative `Circuit`, `Series`, `Parallel` functions
- **TypeScript API** — Full `Schematic` / `Node` / `Pin` model
- **31 ERC rules** — Shorts, polarity, current and voltage ratings, power dissipation,
  fan-out, logic levels, floating inputs, transistor drive, op-amp topology, and more.
  Configurable severity with `strict` / `balanced` / `relaxed` presets.
- **Component library** — Resistors, capacitors, inductors, diodes, LEDs, BJTs, MOSFETs, op-amps, logic gates
- **SI unit helpers** — `kOhm`, `uF`, `mH`, `kHz`, `mA`, …
- **Interoperability** — SPICE netlists, `.ws` DSL files, JSON/CSV DB round-trip
- **CLI** — `wirescript convert` / `compile` / `decompile` / `erc` / `rules`
- **327 tests** passing

## Validate from the shell

```sh
wirescript erc circuit.ws              # exits 1 if the circuit has an error
wirescript erc circuit.ws --preset strict --strict-exit   # CI gate
wirescript rules                       # list all 31 rules
```

---

## Run examples

```sh
npm install
npm run example
```

---

## License

MIT — See [LICENSE](./LICENSE).
