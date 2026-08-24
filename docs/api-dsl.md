# DSL API Reference

The DSL API provides a **declarative, concise** way to describe circuits.  
It is built on top of the [TypeScript API](./api-typescript.md) and produces identical internal representations.

---

## `Circuit(name, ...items)` — Series shorthand

The most common entry point. Connects all items in series and returns a `Schematic`.

```ts
Circuit(name: string, ...items: Connectable[]): Schematic
```

```ts
import { Circuit, DC, R, LED, GND, RED } from '@ssevindikx/wirescript';

const circuit = Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
```

### With options

```ts
Circuit(name, options, ...items)
Circuit(name, options, paths)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `autoGround` | `boolean` | `true` | Places a `GND()` symbol on the source return path when the circuit has none, then connects any unconnected source negative pins to it. See [the ground model](erc.md#the-ground-model). |

```ts
// Disable autoGround (useful for op-amp circuits with explicit power pins)
const buf = Circuit('Buffer', { autoGround: false }, [
  [VCC(15), op.vPos],
  [VNEG(-15), op.vNeg],
  [op.out, op.inN],
  [op.inP, GND()],
]);
```

---

## Multi-path syntax `Circuit(name, paths[][])`

For circuits with branches (multi-pin components like transistors, op-amps):

```ts
Circuit(name: string, paths: PathItem[][]): Schematic
```

Each inner array is an independent series path. Shared component pins act as junction points.

```ts
import { Circuit, DC, R, LED, GND, NPN, kOhm, RED } from '@ssevindikx/wirescript';

const t = NPN('2N2222');

const circuit = Circuit('BJT Switch', [
  [DC(5), R(kOhm(1)), LED(RED), t.C],   // Collector path
  [t.E, GND()],                          // Emitter to ground
  [DC(5), R(kOhm(10)), t.B],            // Base drive
]);
```

---

## `Series(...items)` — Explicit series connection

```ts
Series(...items: Connectable[]): ConnectionResult
```

Connects components end-to-end. Returns a `ConnectionResult` that can be nested.

```ts
import { Series, DC, R, LED, GND, RED } from '@ssevindikx/wirescript';

const branch = Series(R(220), LED(RED));  // reusable sub-circuit
```

---

## `Parallel(...items)` — Parallel connection

```ts
Parallel(...items: Connectable[]): ConnectionResult
```

All first pins share one node; all last pins share another.

```ts
import { Circuit, DC, Parallel, R, GND } from '@ssevindikx/wirescript';

const circuit = Circuit('Parallel R',
  DC(9),
  Parallel(R(1000), R(2200), R(4700)),
  GND()
);
```

Nesting is supported:

```ts
Circuit('Mixed',
  DC(5),
  Parallel(
    Series(R(220), LED(RED)),
    Series(R(220), LED(GREEN)),
    Series(R(180), LED(BLUE))
  ),
  GND()
);
```

---

## `wire(pin1, pin2)` — Connect two pins

```ts
wire(pin1: Pin, pin2: Pin): Node
```

Creates a node and connects both pins to it.

```ts
import { wire } from '@ssevindikx/wirescript';

const node = wire(r1.p2, c1.p1);
```

---

## `junction(...pins)` — Connect many pins

```ts
junction(...pins: Pin[]): Node
```

Connects 2+ pins to a single shared node (electrical junction).

```ts
import { junction } from '@ssevindikx/wirescript';

const midNode = junction(r1.p2, c1.p1, led.anode);
```

---

## `toGround(pin, schematic)` — Pin to GND

```ts
toGround(pin: Pin, schematic: Schematic): void
```

Connects a pin to the schematic's ground node.

```ts
import { toGround } from '@ssevindikx/wirescript';

toGround(cap.p2, mySchematic);
```

---

## `applyToCircuit(schematic, result)` — Merge result into schematic

```ts
applyToCircuit(schematic: Schematic, result: ConnectionResult): Schematic
```

Adds all components and nodes from a `ConnectionResult` into an existing schematic.

```ts
import { createSchematic, applyToCircuit, Series, DC, R, GND } from '@ssevindikx/wirescript';

const s = createSchematic('Custom');
applyToCircuit(s, Series(DC(5), R(1000), GND()));
```

---

## `Connectable` type

Items accepted by `Series`, `Parallel`, and `Circuit`:

```ts
type Connectable = Component | Pin | ConnectionResult;
```

Any component, a specific pin of a component, or the result of a previous `Series`/`Parallel` call.

---

## Component factory functions

See [Components](./components.md) for the full list.  
Quick reference:

```ts
// Passives
R(330)              // Resistor 330 Ω
C(uF(100))          // Capacitor 100 µF
L(mH(10))           // Inductor 10 mH

// Diodes
D()                 // Generic diode (Vf=0.7V)
D('1N4148')         // Diode by part number
LED(RED)            // Red LED

// Sources
DC(5)               // 5 V DC source
AC(12, 60)          // 12 V AC @ 60 Hz
IDC(mA(20))         // 20 mA DC current source
GND()               // Ground

// Power rails
VCC(5)              // +5 V rail
VDD(3.3)            // +3.3 V rail
VPOS(15)            // +15 V (op-amp)
VNEG(-15)           // −15 V (op-amp)

// Transistors
NPN('2N2222')       // NPN BJT
PNP('2N2907')       // PNP BJT
NMOS()              // N-channel MOSFET
PMOS()              // P-channel MOSFET

// Op-Amps
OpAmp('LM741')      // 5-pin op-amp
OpAmp3('TL072')     // 3-pin simplified op-amp

// Logic gates
NOT()  AND()  OR()  XOR()  NAND()  NOR()
HIGH() LOW()
CLK(kHz(1))         // 1 kHz clock source
```
