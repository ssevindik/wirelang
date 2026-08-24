# Getting Started

## Install

```sh
npm install @ssevindikx/wirescript
```

The 1.0 release candidate is published under the `next` tag:

```sh
npm install @ssevindikx/wirescript@next
```

**Requirements:** Node.js 20+. TypeScript 5+ is optional but is most of the
point — the component and pin types are what stop you wiring a base to a drain.

---

## Your first circuit

```ts
import { Circuit, DC, R, LED, GND, RED } from '@ssevindikx/wirescript';

const circuit = Circuit('LED Driver',
  DC(5),     // 5 V source
  R(330),    // 330 Ω current-limiting resistor
  LED(RED),  // red LED, Vf = 1.8 V
  GND(),     // ground reference
);

console.log(circuit.getSummary());
```

```
Circuit: LED Driver
Components: 4
Nodes: 3

Components:
  V1: DC(5V)
  R1: Resistor(330Ω)
  LED1: LED(red, Vf=1.8V)
  GND1: GND

Connections:
  V1.positive ── R1.1
  R1.2 ── LED1.anode
  V1.negative ── LED1.cathode ── GND1.gnd
```

Components are wired **in series, in the order you list them**, and the source's
return terminal is connected to ground automatically.

---

## Check it

```ts
console.log(circuit.erc().report());
// ✅ ERC passed — no violations found.
```

Now get it wrong on purpose — drop the resistor and put the LED across 12 V:

```ts
import { VCC } from '@ssevindikx/wirescript';

const led = LED(RED);
const bad = Circuit('Bare LED', { autoGround: false }, [
  [VCC(12), led.anode],
  [led.cathode, GND()],
]);

console.log(bad.erc().report());
```

```
ERC Result: 2 error(s), 0 warning(s), 0 info(s)

🔴 ERRORS (2)
  [ERC_SUPPLY_SHORT] Net "node_1" (12V) reaches ground through LED1
                     (LED(red, Vf=1.8V)) with zero series resistance.
                     This shorts the supply.
      ↳ Add a current-limiting resistor in this path.
  [ERC_NO_CURRENT_LIMIT] LED1: forward-biased across 12V with zero series
                     resistance. Forward current is limited only by the
                     supply — the LED will be destroyed.
      ↳ Add a series resistor. For 12V and Vf=1.8V at 10mA, use about 1.02kΩ.
```

Every violation carries the numbers it computed and a concrete fix. There are
[31 rules](./erc.md); `wirescript rules` lists them.

---

## Circuits that are not one chain

`Circuit()` also takes an array of **paths**. Each inner array is wired in
series; naming a specific pin joins the paths at that pin.

```ts
import { NPN, kOhm } from '@ssevindikx/wirescript';

const t = NPN('2N2222');

Circuit('BJT Switch', [
  [DC(5), R(kOhm(1)), LED(RED), t.C],   // collector load
  [t.E, GND()],                          // emitter to ground
  [DC(5), R(kOhm(10)), t.B],             // base drive
]);
```

This is how every multi-pin part is wired — transistors, op-amps, logic gates.
See the [DSL API](./api-dsl.md) for `Series`, `Parallel` and nesting.

---

## Full control

When a circuit does not decompose into paths, or you are generating it
programmatically, wire nodes yourself:

```ts
import { createSchematic, DC, R, LED, GND, RED } from '@ssevindikx/wirescript';

const s = createSchematic('LED Driver');
const src = DC(5), r = R(330), led = LED(RED), gnd = GND();

s.addComponents(src, r, led, gnd);

const n1 = s.createNode();
const n2 = s.createNode();

s.connect(src.positive, n1);
s.connect(r.p1,         n1);
s.connect(r.p2,         n2);
s.connect(led.anode,    n2);
s.connect(led.cathode,  gnd.getGroundNode());
s.connect(src.negative, gnd.getGroundNode());
```

Identical result — `s.erc()` passes. See the [TypeScript API](./api-typescript.md).

---

## Units

Write values in the units on the part, not in bare SI:

```ts
import { kOhm, MOhm, uF, nF, mH, kHz, mA } from '@ssevindikx/wirescript';

R(kOhm(4.7))   // 4.7 kΩ → 4700
C(nF(100))     // 100 nF → 100e-9
L(mH(10))      // 10 mH  → 0.01
AC(5, kHz(1))  // 1 kHz  → 1000
```

These are plain functions returning numbers, so `R(4700)` works too. See
[Units](./units.md).

---

## From the shell

```sh
# Check a circuit — exits 1 if it has an error, so it drops into CI as-is
wirescript erc circuit.ws

# Strictest profile, and fail on warnings too
wirescript erc circuit.ts --preset strict --strict-exit

# Convert between any two formats
wirescript convert circuit.ws --to netlist --out circuit.net

# List every ERC rule
wirescript rules
```

See the [CLI reference](./cli.md).

---

## Save and load

```ts
import { compileDslToDb, dbToSchematic, serializeDb, deserializeDb }
  from '@ssevindikx/wirescript';

// Store
await fs.writeFile('circuit.json', serializeDb(compileDslToDb(circuit)));

// Load — back to a live Schematic, not just data
const restored = dbToSchematic(deserializeDb(await fs.readFile('circuit.json', 'utf-8')));
console.log(restored.erc().report());
```

The round-trip is lossless: component ids, labels, pin ids and node ids all
survive. See [Serialization](./serialization.md) and [IO & Formats](./io.md).

---

## Run the bundled examples

```sh
git clone https://github.com/ssevindikx/wirescript
cd wirescript && npm install
npm run example        # print every example circuit
npm run erc:examples   # run ERC over them at --preset strict
```

---

## Where next

| I want to… | Go to |
|---|---|
| Learn the declarative syntax properly | [DSL API](./api-dsl.md) |
| Wire complex circuits by hand | [TypeScript API](./api-typescript.md) |
| See every component and its pins | [Components](./components.md) |
| Understand what ERC checks, and tune it | [ERC](./erc.md) |
| Move circuits between formats | [IO & Formats](./io.md) |
| Export to a simulator | [Netlist](./netlist.md) |
| Use the command line | [CLI](./cli.md) |
| Copy a working circuit | [Examples](./examples.md) |
