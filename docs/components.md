# Components Reference

All components are importable from `'wirescript'`.  
Every component has:
- An auto-generated `label` (`R1`, `C2`, `Q1`, …)
- A `validate()` method returning `string[]` errors
- A `toString()` producing a human-readable description

---

## Passive Components

### Resistor — `R(value)`

```ts
import { R, kOhm, MOhm } from '@ssevindikx/wirescript';

const r1 = R(330);           // 330 Ω
const r2 = R(kOhm(4.7));    // 4.7 kΩ
const r3 = R(MOhm(1));      // 1 MΩ
```

| Pin | Name | Description |
|---|---|---|
| `p1` | `'1'` | Terminal 1 |
| `p2` | `'2'` | Terminal 2 |

**Params:** `resistance` (Ω), `value` (same), `unit: 'Ω'`  
**Validation:** `resistance > 0`

---

### Capacitor — `C(value)`

```ts
import { C, uF, nF, pF } from '@ssevindikx/wirescript';

const c1 = C(uF(100));   // 100 µF
const c2 = C(nF(10));    // 10 nF
const c3 = C(pF(22));    // 22 pF
```

| Pin | Name |
|---|---|
| `p1` | `'1'` |
| `p2` | `'2'` |

**Params:** `capacitance` (F), `unit: 'F'`

---

### Inductor — `L(value)`

```ts
import { L, mH, uH } from '@ssevindikx/wirescript';

const l1 = L(mH(10));    // 10 mH
const l2 = L(uH(470));   // 470 µH
```

| Pin | Name |
|---|---|
| `p1` | `'1'` |
| `p2` | `'2'` |

**Params:** `inductance` (H), `unit: 'H'`

---

## Diodes

### Diode — `D(params?)`

```ts
import { D } from '@ssevindikx/wirescript';

const d1 = D();                          // Generic (Vf=0.7V)
const d2 = D('1N4148');                 // By part number
const d3 = D({ forwardVoltage: 0.4, maxCurrent: 0.1 });
```

| Pin | Name | Description |
|---|---|---|
| `anode` | `'anode'` | Positive terminal |
| `cathode` | `'cathode'` | Negative terminal |

**Params:**
| Field | Default | Description |
|---|---|---|
| `forwardVoltage` | `0.7` | V |
| `maxCurrent` | `1.0` | A |
| `partNumber` | `undefined` | e.g. `'1N4148'` |

---

### LED — `LED(color?)` / `LED(params?)`

```ts
import { LED, RED, GREEN, BLUE, YELLOW, WHITE, ORANGE, PURPLE, CYAN, PINK, AMBER, IR, UV } from '@ssevindikx/wirescript';

const led1 = LED(RED);
const led2 = LED(BLUE);
const led3 = LED({ color: GREEN, forwardVoltage: 2.1, maxCurrent: 0.02 });
```

| Pin | Name |
|---|---|
| `anode` | `'anode'` |
| `cathode` | `'cathode'` |

**Default forward voltages by color:**

| Color | Vf (V) | If_max (mA) |
|---|---|---|
| Red | 1.8 | 20 |
| Orange / Amber | 2.0 | 20 |
| Yellow | 2.1 | 20 |
| Green | 2.2 | 20 |
| White | 3.0 | 20 |
| Blue / Purple / Cyan / Pink | 3.2 | 20 |
| IR | 1.2 | 20 |
| UV | 3.4 | 20 |

---

## Voltage Sources

### DC Voltage Source — `DC(voltage)`

```ts
import { DC } from '@ssevindikx/wirescript';

const src = DC(5);    // 5 V DC
const src = DC(3.3);  // 3.3 V DC
```

| Pin | Name | Direction |
|---|---|---|
| `positive` (`p`) | `'positive'` | Output |
| `negative` (`n`) | `'negative'` | Input |

---

### AC Voltage Source — `AC(voltage, frequency?)`

```ts
import { AC, kHz } from '@ssevindikx/wirescript';

const src = AC(12, 60);         // 12 Vrms @ 60 Hz
const src = AC(1, kHz(10));     // 1 Vrms @ 10 kHz
```

**Params:** `voltage` (V), `frequency` (Hz), `sourceType: 'ac'`

---

### DC Current Source — `IDC(current)`

```ts
import { IDC, mA } from '@ssevindikx/wirescript';

const i = IDC(mA(10));   // 10 mA DC current source
```

| Pin | Name |
|---|---|
| `positive` (`p`) | `'positive'` |
| `negative` (`n`) | `'negative'` |

---

### AC Current Source — `IAC(current, frequency?)`

```ts
import { IAC, mA, kHz } from '@ssevindikx/wirescript';

const i = IAC(mA(1), kHz(1));
```

---

### Ground — `GND()`

```ts
import { GND } from '@ssevindikx/wirescript';

const gnd = GND();
gnd.gnd              // Pin
gnd.getGroundNode()  // Node (isGround() === true)
```

---

## Power Rails

Ideal voltage rails (zero source impedance assumed).

```ts
import { VCC, VDD, VPOS, VNEG } from '@ssevindikx/wirescript';

VCC(5)      // +5 V digital supply
VDD(3.3)    // +3.3 V (common for MCUs)
VPOS(15)    // +15 V (op-amp positive rail)
VNEG(-15)   // −15 V (op-amp negative rail)
```

Each has a single pin (`p1`) connected to the rail voltage.

---

## Transistors

### NPN BJT — `NPN(params?)`

```ts
import { NPN } from '@ssevindikx/wirescript';

const t = NPN();              // Generic NPN
const t = NPN('2N2222');     // By model name
const t = NPN({ model: 'BC547', hfe: 200, vce_sat: 0.2, vbe: 0.7 });
```

| Pin | Name | Description |
|---|---|---|
| `B` | `'B'` | Base (control) |
| `C` | `'C'` | Collector |
| `E` | `'E'` | Emitter |

**Supported models:** `2N2222`, `2N3904`, `BC547`, `BC548`, `generic`

**Params:** `hfe` (β, current gain), `vce_sat` (V), `vbe` (V)

---

### PNP BJT — `PNP(params?)`

Same interface as `NPN`. Supported models: `2N2907`, `2N3906`, `BC557`, `generic`.

```ts
const t = PNP('2N2907');
t.B  // base
t.C  // collector
t.E  // emitter
```

---

### N-Channel MOSFET — `NMOS(params?)`

```ts
import { NMOS } from '@ssevindikx/wirescript';

const m = NMOS();
const m = NMOS('2N7000');
const m = NMOS({ model: 'IRF540', vth: 3.0, rds_on: 0.077, id_max: 28 });
```

| Pin | Name | Description |
|---|---|---|
| `G` | `'G'` | Gate (control) |
| `D` | `'D'` | Drain |
| `S` | `'S'` | Source |

**Params:** `vth` (threshold V), `rds_on` (Ω), `id_max` (A)

---

### P-Channel MOSFET — `PMOS(params?)`

Same interface as `NMOS`. The threshold voltage is **negative** — `PMOS().vth`
is `-2`, and `PMOS('IRF9540').vth` is `-4`.

---

### N-Channel JFET — `NJFET(params?)`

A JFET is *depletion-mode*: it conducts at Vgs = 0 and is pinched off by
driving the gate towards the source. That is the opposite of a MOSFET, which is
why a JFET with a floating gate defaults to conducting.

```ts
import { NJFET } from '@ssevindikx/wirescript';

const j = NJFET();
const j = NJFET('2N3819');
const j = NJFET({ model: 'J201', vgs_off: -0.8, idss: 0.0006 });
```

| Pin | Name | Description |
|---|---|---|
| `G` | `'G'` | Gate (control) |
| `D` | `'D'` | Drain |
| `S` | `'S'` | Source |

**Params:** `vgs_off` (pinch-off V, **negative** for N-channel), `idss` (drain
current at Vgs = 0, in A), `rds_on` (Ω)

**Models:** `2N3819`, `2N5457`, `2N5458`, `J201`, `BF245`

```ts
// Source follower
const j = NJFET('2N3819');
Circuit('Follower', [
  [VCC(12), j.D],
  [j.S, R(kOhm(2.2)), GND()],
  [j.G, R(MOhm(1)), GND()],
]);
```

---

### P-Channel JFET — `PJFET(params?)`

Same interface as `NJFET`, with a **positive** pinch-off voltage.

**Models:** `2N5460`, `2N5461`, `J270`

---

## Op-Amps

### 5-pin Op-Amp — `OpAmp(partNumber?)`

Full op-amp with supply pins. Use when power supply connections matter.

```ts
import { OpAmp, LM741, TL072, NE5532, LM358 } from '@ssevindikx/wirescript';

const op = OpAmp();           // Generic
const op = OpAmp('LM741');   // Specific part
const op = LM741();           // Shorthand preset
```

| Pin | Name | Description |
|---|---|---|
| `inP` | `'inP'` | Non-inverting input (+) |
| `inN` | `'inN'` | Inverting input (−) |
| `out` | `'out'` | Output |
| `vPos` | `'vPos'` | Positive supply (V+) |
| `vNeg` | `'vNeg'` | Negative supply (V−) |

**Presets:** `LM741()`, `TL072()`, `NE5532()`, `LM358()`

**Full circuit example:**
```ts
const op = OpAmp('LM741');
Circuit('Inverting Amp', [
  [VCC(15),   op.vPos],
  [VNEG(-15), op.vNeg],
  [AC(0.1, 1000), R(kOhm(10)), op.inN],
  [op.out,    R(kOhm(100)), op.inN],   // feedback
  [op.inP,    GND()],
]);
```

---

### 3-pin Op-Amp — `OpAmp3(partNumber?)`

Simplified op-amp without explicit power pins. Use for quick schematics.

```ts
const op = OpAmp3('TL072');
// Pins: inP, inN, out
```

---

## Logic Gates

All gates support an optional IC family string (default: `'74HC'`).

```ts
import { NOT, AND, OR, XOR, NAND, NOR } from '@ssevindikx/wirescript';

const inv  = NOT();           // Inverter — 1 input
const and2 = AND();           // 2-input AND
const or2  = OR();            // 2-input OR
const xor2 = XOR();           // 2-input XOR
const nand = NAND('74LS');    // NAND with explicit family
const nor  = NOR();
```

**Pin names:**
- `NOT`: `A` (input), `Y` (output)
- `AND`, `OR`, `XOR`, `NAND`, `NOR`: `A`, `B` (inputs), `Y` (output)

---

### Logic Levels — `HIGH()` / `LOW()`

Constant logic-level sources (1-pin output).

```ts
import { HIGH, LOW } from '@ssevindikx/wirescript';

Circuit('NOT Gate', { autoGround: false }, [
  [HIGH(), not1.A],
  [not1.Y, LED(RED), LOW()],
]);
```

---

### Clock — `CLK(frequency, dutyCycle?)`

```ts
import { CLK, kHz } from '@ssevindikx/wirescript';

const clk = CLK(kHz(1));          // 1 kHz, 50% duty
const clk = CLK(kHz(1), 0.25);   // 1 kHz, 25% duty
```

Output pin: `out`

---

## `ComponentType` enum

```ts
import { ComponentType } from '@ssevindikx/wirescript';

ComponentType.Resistor       // 'resistor'
ComponentType.Capacitor      // 'capacitor'
ComponentType.Inductor       // 'inductor'
ComponentType.Diode          // 'diode'
ComponentType.LED            // 'led'
ComponentType.VoltageSource  // 'voltage_source'
ComponentType.CurrentSource  // 'current_source'
ComponentType.Ground         // 'ground'
ComponentType.PowerRail      // 'power_rail'

// Transistors — each factory carries its own specific type
ComponentType.NPN            // 'npn'
ComponentType.PNP            // 'pnp'
ComponentType.NMOS           // 'nmos'
ComponentType.PMOS           // 'pmos'
ComponentType.NJFET          // 'njfet'
ComponentType.PJFET          // 'pjfet'

ComponentType.OpAmp          // 'opamp'
ComponentType.LogicGate      // 'logic_gate'
ComponentType.LogicHigh      // 'logic_high'
ComponentType.LogicLow       // 'logic_low'
ComponentType.Clock          // 'clock'
```

### Deprecated: the generic transistor types

`ComponentType.BJT` (`'bjt'`) and `ComponentType.MOSFET` (`'mosfet'`) are
**deprecated since 0.5.0**. No component emits them — `NPN()` is
`ComponentType.NPN`, `NMOS()` is `ComponentType.NMOS`, and so on.

They remain in the enum so that `wirescript-db@v1` files written before 0.5.0
still load: deserialization maps the legacy type onto the specific one using
`params.transistorType`.

```ts
// before 0.5.0
if (c.type === ComponentType.BJT && c.params.transistorType === 'PNP') { … }

// now
if (c.type === ComponentType.PNP) { … }

// reading a DB record of unknown vintage
import { resolveComponentType } from '@ssevindikx/wirescript';
resolveComponentType(record);   // 'pnp', whichever way it was written
```
