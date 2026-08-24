# WireScript Documentation

A **code-first DSL** for describing electronic circuits in TypeScript.

Its job is narrow and its scope is deliberate: *which pin is connected to which
node, what each component's physical parameters are, and whether the result is
electrically sound.* No rendering, no coordinates, no simulation — it exports to
SPICE for that.

```ts
import { Circuit, DC, R, LED, GND, RED } from '@ssevindikx/wirescript';

const circuit = Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
console.log(circuit.erc().report());   // ✅ ERC passed — no violations found.
```

---

## Start here

| Guide | What it covers |
|---|---|
| [Getting Started](./getting-started.md) | Install, first circuit, the two API styles |
| [DSL API](./api-dsl.md) | `Circuit`, `Series`, `Parallel` — the declarative way |
| [TypeScript API](./api-typescript.md) | `createSchematic`, manual node and pin wiring |
| [Components](./components.md) | Every built-in part, its pins and parameters |
| [Units](./units.md) | `kOhm`, `uF`, `mH`, `kHz` and the rest |

## Validation

| Guide | What it covers |
|---|---|
| [ERC](./erc.md) | All 31 electrical rules, severity presets, the analysis model |

## Interchange

| Guide | What it covers |
|---|---|
| [IO & Formats](./io.md) | The four formats and every conversion path |
| [Serialization](./serialization.md) | The `wirescript-db@v1` schema, `dbToSchematic` |
| [WireScript DSL (`.ws`)](./ws.md) | The plain-source format |
| [Netlist](./netlist.md) | SPICE import and export, and what SPICE cannot express |
| [CLI](./cli.md) | `convert`, `erc`, `rules`, and the rest |

## Reference

| Guide | What it covers |
|---|---|
| [Examples](./examples.md) | Worked circuits you can copy |
| [Changelog](../CHANGELOG.md) | What changed, and how to migrate |
| [Versioning policy](../README.md#versioning-policy) | What 1.0 promises to keep stable |

---

## How the pieces fit

```
   your code                the IR                    interchange
┌──────────────┐      ┌───────────────┐      ┌─────────────────────────┐
│ Circuit(…)   │─────▶│               │─────▶│ .ws     (source)        │
│ Series(…)    │      │   Schematic   │      │ .json   (DB, exact)     │
│ Parallel(…)  │      │   ├─ Component│◀────▶│ .csv    (DB, tabular)   │
│              │      │   ├─ Node     │      │ .net    (SPICE)         │
│ schematic    │─────▶│   └─ Pin      │      └─────────────────────────┘
│   .addComp() │      │               │
└──────────────┘      └───────┬───────┘
                              │
                              ▼
                        ┌───────────┐
                        │    ERC    │   31 rules · 3 presets
                        └───────────┘
```

Everything converts through the **DB** (`wirescript-db@v1`), and every path is
reversible — `dbToSchematic()` brings a stored circuit back to the live IR.

---

## Two API styles

Both build the same `Schematic`. Use whichever fits the circuit.

### DSL — declarative

Best for anything that reads as a chain or a set of chains.

```ts
Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
```

Multi-pin parts use the array form, where each inner array is one path:

```ts
const t = NPN('2N2222');

Circuit('BJT Switch', [
  [DC(5), R(kOhm(1)), LED(RED), t.C],   // collector load
  [t.E, GND()],                          // emitter to ground
  [DC(5), R(kOhm(10)), t.B],             // base drive
]);
```

### TypeScript — imperative

Best when you are generating circuits programmatically, or when the topology
does not decompose into paths.

```ts
const s = createSchematic('LED Driver');
const src = DC(5), r = R(330), led = LED(RED), gnd = GND();
s.addComponents(src, r, led, gnd);

const n1 = s.createNode();
const n2 = s.createNode();

s.connect(src.positive, n1);
s.connect(r.p1, n1);
s.connect(r.p2, n2);
s.connect(led.anode, n2);
s.connect(led.cathode, gnd.getGroundNode());
s.connect(src.negative, gnd.getGroundNode());
```

---

## What WireScript is not

- **Not a simulator.** It computes no waveforms and solves no operating point.
  ERC reasons statically about topology and DC impedance; anything beyond that
  is a SPICE export away.
- **Not a schematic editor.** There are no coordinates, no symbols, no layout.
- **Not a PCB tool.** No footprints, no routing.

What it *is*: a precise, version-controllable description of circuit topology,
with a checker strict enough to catch the mistakes that cost hardware.
