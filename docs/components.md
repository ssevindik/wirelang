# Components

This page summarizes the main component classes and factories exported by the project. For each component group you'll see a short description, typical API usage, and a small example.

## Passive Components

- Resistor: `R(value)` — create a resistor. Value may use helpers like `kOhm(10)`.
- Capacitor: `C(value)` — create a capacitor (use `uF` helper).
- Inductor: `L(value)` — create an inductor (use `mH` helper).

Example

```ts
import { R, C, L, kOhm, uF, mH } from '../core';

const r = R(kOhm(10));
const c = C(uF(0.1));
const l = L(mH(10));
```

## Diodes & LEDs

- Diode: `D(model?: string)` — create a diode instance (optional model string).
- LED: `createLED(color)` / `LED(color)` — create LED component; colors available are re-exported constants (e.g. `RED`, `GREEN`).

Example

```ts
import { D, createLED, RED } from '../core';

const diode = D('1N4007');
const led = createLED(RED);
```

## Transistors

- BJT: `NPN()` / `PNP()` or factory functions like `NPNTransistor`.
- MOSFET: `NMOS()` / `PMOS()` and typed factories.

Usage is component-specific; place transistor pins into circuits just like other components.

## Op-Amps

See the dedicated Op-Amps page for models and pin names: [Op-Amps](./op-amps.md)

## Logic Gates

- Digital gates are provided as factories: `NOT()`, `AND()`, `OR()`, `XOR()`, `NAND()`, `NOR()`.
- Input helpers: `HIGH()`, `LOW()`, `CLK()`.

Example

```ts
import { AND, HIGH, LED, GND } from '../core';

const andGate = AND();
// wire HIGH, gate pins, LED and GND in a circuit
```

## Power Rails & Sources

See the Sources page for full usage: [Sources](./sources.md)
