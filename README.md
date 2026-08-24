# WireScript

A **code-first DSL** for describing electronic circuits in TypeScript.

> **1.0.0-rc.1 — API frozen.** Nothing in the public surface changes between this
> tag and 1.0.0. Install it with `npm i @ssevindikx/wirescript@next`. See the
> [changelog](./CHANGELOG.md) and the [versioning policy](#versioning-policy).

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
| [Changelog](./CHANGELOG.md) | What changed in each release, and how to migrate |
| [Full reference](https://claude.ai/code/artifact/2c1d3d96-c24c-4502-ae1b-3f3944e262a4) | Everything on one page — components, rules, formats, CLI |

---

## Features

- **DSL API** — Declarative `Circuit`, `Series`, `Parallel` functions
- **TypeScript API** — Full `Schematic` / `Node` / `Pin` model
- **31 ERC rules** — Shorts, polarity, current and voltage ratings, power dissipation,
  fan-out, logic levels, floating inputs, transistor drive, op-amp topology, and more.
  Configurable severity with `strict` / `balanced` / `relaxed` presets.
- **Component library** — Resistors, capacitors, inductors, diodes, LEDs, BJTs, MOSFETs, JFETs, op-amps, logic gates
- **SI unit helpers** — `kOhm`, `uF`, `mH`, `kHz`, `mA`, …
- **Interoperability** — SPICE netlists, `.ws` DSL files, JSON/CSV DB. Every format
  round-trips back to the live IR through `dbToSchematic()`.
- **CLI** — `wirescript convert` / `compile` / `decompile` / `erc` / `rules`
- **529 tests** passing

## Validate from the shell

```sh
wirescript erc circuit.ws              # exits 1 if the circuit has an error
wirescript erc circuit.ws --preset strict --strict-exit   # CI gate
wirescript rules                       # list all 31 rules
```

---

## Versioning policy

WireScript follows [semantic versioning](https://semver.org/). From **1.0.0**
onwards the following are stable, and a breaking change to any of them requires
a major version bump:

| Stable | What that means |
|---|---|
| The exports of `@ssevindikx/wirescript` | Nothing is removed or renamed. `tests/api-surface.test.ts` enforces this. |
| The `wirescript-db@v1` schema | Files written by an older 1.x still load. |
| `ERC_*` rule ids | A rule id keeps its meaning; `--off` and `severity` overrides keep working. |
| CLI command names and flags | Existing invocations keep working. |

**Deliberately not stable:** ERC rule *severities*, and the set of rules itself.

New rules will keep finding faults in circuits that previously passed, and an
existing rule may be escalated in a minor release. If that were treated as
breaking, the rule set would freeze at 1.0 and never improve. Pin the behaviour
you need instead:

```ts
runERC(circuit, {
  preset: 'relaxed',                 // only unambiguous faults are errors
  severity: { fanOut: 'warning' },   // or pin one rule
});
```

```sh
wirescript erc circuit.ws --preset relaxed --off missingDecoupling
```

Pre-1.0 releases (`0.x`) may break anything; the changelog says what and how to
migrate.

### What backs the 1.0 claims

| Gate | What it proves |
|---|---|
| `tests/api-surface.test.ts` | The exact set of 172 public exports; removing one fails the build |
| `tests/round-trip.test.ts` | Every component type survives all five conversion paths, with a coverage test that fails if a new type is added without an entry |
| `npm run erc:examples` | Every shipped example circuit passes ERC at `--preset strict` |
| CI on Node 20 / 22 / 24 | Typecheck, build, 529 tests, and the ERC gate |

---

## Run examples

```sh
npm install
npm run example
```

---

## License

MIT — See [LICENSE](./LICENSE).
