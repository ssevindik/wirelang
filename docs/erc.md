# Electrical Rule Check (ERC)

ERC validates circuits against **physics-based electrical rules** without running a simulation.
It catches wiring mistakes, dangerous configurations and design-quality issues before they become
hardware problems.

31 rules across three groups: **topology**, **power distribution**, and **device physics**.

---

## Quick Start

```ts
import { Circuit, DC, R, LED, GND, RED, runERC } from '@ssevindikx/wirescript';

const circuit = Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
const result = runERC(circuit);

console.log(result.passed);   // true
console.log(result.report()); // ✅ ERC passed — no violations found.
```

```ts
// Inline on any schematic
const result = circuit.erc();
```

From the shell:

```bash
wirescript erc circuit.ws          # exits 1 if any error-severity violation is found
wirescript rules                   # list every rule and its default severity
```

---

## What a failure looks like

```ts
const led = LED(RED);
const circuit = Circuit('Bare LED', { autoGround: false }, [
  [VCC(12), led.anode],
  [led.cathode, GND()],
]);

console.log(runERC(circuit).report());
```

```
ERC Result: 2 error(s), 0 warning(s), 0 info(s)

🔴 ERRORS (2)
  [ERC_SUPPLY_SHORT] Net "node_1" (12V) reaches ground through LED1 (LED(red, Vf=1.8V))
                     with zero series resistance. This shorts the supply.
      ↳ Add a current-limiting resistor in this path.
  [ERC_NO_CURRENT_LIMIT] LED1: forward-biased across 12V with zero series resistance.
                     Forward current is limited only by the supply — the LED will be destroyed.
      ↳ Add a series resistor. For 12V and Vf=1.8V at 10mA, use about 1.02kΩ.
```

Every violation carries a **message** (what is wrong, with the numbers) and a **hint**
(what to do about it).

---

## `runERC(schematic, options?)`

```ts
const result = runERC(schematic);

const result = runERC(schematic, {
  preset: 'strict',                       // strict | balanced (default) | relaxed
  severity: { missingDecoupling: 'off' }, // per-rule override
  fanOutLimit: 4,
  resistorPowerRating: 0.125,
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `preset` | `'strict' \| 'balanced' \| 'relaxed'` | `'balanced'` | Severity profile |
| `severity` | `Record<string, 'error' \| 'warning' \| 'info' \| 'off'>` | `{}` | Per-rule override, keyed by rule key **or** `ERC_*` id |
| `rules` | `Record<ruleKey, boolean>` | all on | Enable/disable individual rules |
| `fanOutLimit` | `number` | `10` | Max logic inputs per gate output (74HC) |
| `resistorPowerRating` | `number` | `0.25` | Assumed resistor rating, in watts |
| `defaultDiodeCurrent` | `number` | `0.02` | Fallback max forward current, in amps |
| `defaultLogicSupply` | `number` | `5` | Assumed logic supply when no rail is attached |

---

## `ERCResult`

```ts
result.passed        // boolean — true when there are zero errors
result.clean         // boolean — true when there is nothing at all to report
result.violations    // ERCViolation[] — all violations, errors first
result.errors        // ERCViolation[]
result.warnings      // ERCViolation[]
result.infos         // ERCViolation[]
result.counts        // { error: 2, warning: 0, info: 1 }

result.byRule('noCurrentLimit')       // violations of one rule (key or ERC_* id)
result.has('ERC_SHORT_CIRCUIT')       // boolean

result.summary()     // one line per violation
result.report()      // grouped by severity, with fix hints
result.toJSON()      // plain object for tooling / CI
```

### `ERCViolation`

```ts
interface ERCViolation {
  ruleId:     string;       // 'ERC_SHORT_CIRCUIT'
  ruleKey:    ERCRuleKey;   // 'shortCircuit'
  ruleName:   string;       // 'Short Circuit'
  severity:   'error' | 'warning' | 'info';
  message:    string;       // what is wrong, with computed values
  hint?:      string;       // how to fix it
  components: Component[];
  nodes:      Node[];
  pins:       Pin[];
}
```

---

## Severity

| Severity | Meaning |
|---|---|
| 🔴 `error` | The circuit will not work, or hardware will be damaged |
| 🟡 `warning` | May misbehave, or violates a datasheet limit |
| 🔵 `info` | Design-quality observation; nothing is broken |

`result.passed` is `true` only when there are **zero errors**.

### Presets

| Preset | Use it for |
|---|---|
| `strict` | Design review and CI gates — every real defect is an error |
| `balanced` | **Default.** Hard faults and datasheet violations are errors; style notes are warnings |
| `relaxed` | Early exploration — only unambiguous, damage-causing faults are errors |

Precedence, highest first: **`severity` override → `rules` on/off → preset**.

```ts
runERC(circuit, {
  preset: 'strict',
  severity: {
    missingDecoupling: 'off',        // never report this one
    fanOut: 'warning',               // downgrade despite the strict preset
    ERC_NO_CURRENT_LIMIT: 'error',   // ids work too
  },
});
```

---

## The ground model

WireScript follows the OrCAD/PSpice convention: **the reference is a symbol you
place, not something inferred from the topology.** A voltage source's negative
terminal is a source terminal, not a 0V reference — a circuit whose only
"ground" is `V1.negative` still reports `ERC_NO_GROUND`.

Two rules fall out of that:

| | Question it asks |
|---|---|
| `ERC_NO_GROUND` | Does a reference exist at all? |
| `ERC_FLOATING_NODE` | Can every net reach that reference **through DC**? |

The second is the one that catches AC-coupled stages. A capacitor is an open
circuit at DC, so a node sitting behind one has no DC operating point — SPICE
cannot solve it, and the fix is a bias resistor to ground:

```ts
// ❌ ERC_FLOATING_NODE — the node past C1 only reaches ground through C1
[r1.pin('2'), c1.pin('1')],
[c1.pin('2'), r2.pin('1')],
[r2.pin('2'), c1.pin('2')],

// ✅ a bias resistor gives the coupled node its DC return
[c1.pin('2'), bias.pin('1')],
[bias.pin('2'), gnd.gnd],
```

`ERC_FLOATING_NODE` traverses *through* transistors and ICs — the question is
whether DC could ever reach the reference, not whether it does right now. A net
with no route to ground at all is a different fault, and
`ERC_ISOLATED_SECTION` reports that one with the whole orphaned group.

### `autoGround` places the symbol for you

So that ordinary single-supply circuits do not have to spell out the reference,
`Circuit()` defaults to `autoGround: true`: when the circuit has no `GND()` and
a source has a return terminal, the DSL **places a real ground symbol** on that
return node.

```ts
const v = DC(5), r = R(kOhm(1));
const c = Circuit('loop', [
  [v.pin('positive'), r.pin('1')],
  [r.pin('2'), v.pin('negative')],
]);
c.components;   // V1, R1, GND1  ← the symbol is really there
```

The symbol appears in `schematic.components` and exports to the netlist like
any other. Pass `{ autoGround: false }` to keep ERC strict and place every
reference yourself.

---

## The rule catalogue

Run `wirescript rules` for this table in your terminal, or `listERCRules()` from code.

| Rule ID | Key | Balanced | Strict | Relaxed | Catches |
|---|---|:--:|:--:|:--:|---|
| `ERC_EMPTY_CIRCUIT` | `emptyCircuit` | 🔴 | 🔴 | 🔴 | The schematic contains no components. |
| `ERC_NO_GROUND` | `noGround` | 🔴 | 🔴 | 🔴 | The circuit has no 0V reference, so all node voltages are undefined. |
| `ERC_UNCONNECTED_PIN` | `unconnectedPin` | 🔴 | 🔴 | 🟡 | A component terminal is not attached to any net. |
| `ERC_DANGLING_NET` | `danglingNet` | 🔴 | 🔴 | 🟡 | A net has only one pin on it, so no current can flow. |
| `ERC_DUPLICATE_REFDES` | `duplicateRefDes` | 🔴 | 🔴 | 🟡 | Two components share the same label, which breaks netlist export. |
| `ERC_ISOLATED_SECTION` | `isolatedSection` | 🟡 | 🔴 | 🔵 | A group of components has no connection to the ground reference. |
| `ERC_FLOATING_NODE` | `floatingNode` | 🔴 | 🔴 | 🟡 | A net reaches ground only through DC-blocking elements, so it has no DC operating point. |
| `ERC_NC_PIN_CONNECTED` | `noConnectPinUsed` | 🔴 | 🔴 | 🟡 | A pin marked no-connect has been wired to a net. |
| `ERC_INVALID_VALUE` | `invalidValue` | 🔴 | 🔴 | 🔴 | A component parameter is outside its physically valid range. |
| `ERC_SHORT_CIRCUIT` | `shortCircuit` | 🔴 | 🔴 | 🔴 | A source is shorted across its own terminals with no current limiting. |
| `ERC_SUPPLY_SHORT` | `supplyShort` | 🔴 | 🔴 | 🔴 | A power rail reaches ground with no impedance in between. |
| `ERC_POWER_CONFLICT` | `powerConflict` | 🔴 | 🔴 | 🔴 | Supplies at different potentials are tied to the same net. |
| `ERC_OUTPUT_CONFLICT` | `outputConflict` | 🔴 | 🔴 | 🔴 | Two active outputs drive the same net. |
| `ERC_MISSING_POWER_PIN` | `missingPowerPin` | 🔴 | 🔴 | 🔴 | A device supply pin is left unconnected. |
| `ERC_POWER_INPUT_NOT_DRIVEN` | `powerInputNotDriven` | 🔴 | 🔴 | 🟡 | A supply pin sits on a net with no source feeding it. |
| `ERC_FLOATING_INPUT` | `floatingInput` | 🔴 | 🔴 | 🟡 | A signal input is unconnected, or sits on a net with no driver. |
| `ERC_NO_LOAD` | `noLoad` | 🟡 | 🔴 | 🔵 | A source cannot deliver current because its loop is not closed. |
| `ERC_DRIVER_CONFLICT` | `driverConflict` | 🟡 | 🟡 | 🔵 | An analog source drives a digital input with no level translation. |
| `ERC_REVERSE_POLARITY` | `reversePolarity` | 🔴 | 🔴 | 🔴 | A polarized device is wired backwards relative to the supply. |
| `ERC_NO_CURRENT_LIMIT` | `noCurrentLimit` | 🔴 | 🔴 | 🔴 | A diode or LED conducts from supply to ground with no series resistance. |
| `ERC_CURRENT_EXCEEDED` | `currentExceeded` | 🔴 | 🔴 | 🟡 | Computed forward current is above the device rating. |
| `ERC_VOLTAGE_EXCEEDED` | `voltageExceeded` | 🔴 | 🔴 | 🟡 | A device sees more voltage than it is rated for. |
| `ERC_POWER_DISSIPATION` | `powerDissipation` | 🟡 | 🔴 | 🔵 | A resistor dissipates more power than its assumed rating. |
| `ERC_FAN_OUT` | `fanOut` | 🔴 | 🔴 | 🟡 | A logic output drives more inputs than its family allows. |
| `ERC_LOGIC_LEVEL_MISMATCH` | `logicLevelMismatch` | 🔴 | 🔴 | 🟡 | A logic input sees a voltage outside its family limits. |
| `ERC_TRANSISTOR_NO_DRIVE` | `transistorNoDrive` | 🔴 | 🔴 | 🟡 | A base or gate is unconnected, leaving the device in an undefined state. |
| `ERC_TRANSISTOR_TERMINAL_FLOATING` | `transistorTerminalFloating` | 🔴 | 🔴 | 🟡 | A collector, emitter, drain or source is unconnected. |
| `ERC_BJT_NO_BASE_RESISTOR` | `baseResistorMissing` | 🔴 | 🔴 | 🟡 | A BJT base is driven from a supply with nothing limiting base current. |
| `ERC_MOSFET_GATE_UNDEFINED` | `gateResistorMissing` | 🟡 | 🟡 | 🔵 | A MOSFET gate has no pull resistor to hold it off. |
| `ERC_OPAMP_OUTPUT_SHORTED` | `opAmpOutputShorted` | 🔴 | 🔴 | 🔴 | An op-amp output is tied to a supply rail or ground. |
| `ERC_OPAMP_NO_FEEDBACK` | `opAmpNoFeedback` | 🟡 | 🟡 | 🔵 | No path connects the op-amp output back to its inverting input. |
| `ERC_MISSING_DECOUPLING` | `missingDecoupling` | 🔵 | 🟡 | 🔵 | An IC supply pin has no local bypass capacitor. |

---

## Notable rules in detail

### `ERC_SHORT_CIRCUIT` / `ERC_SUPPLY_SHORT`

A short is any route from a supply back to its return with **zero series resistance**.
The DC impedance model is what makes this accurate:

| Component | DC behaviour | Limits current? |
|---|---|---|
| Resistor (R > 0) | R ohms | ✅ |
| Resistor (R = 0) | wire | ❌ |
| Inductor | short | ❌ |
| Capacitor | open | ✅ (blocks DC) |
| Diode / LED | Vf drop, ~0 Ω | ❌ |

So an inductor across a supply is correctly reported as a short, and a 0 Ω resistor
is correctly *not* accepted as current limiting.

```ts
Circuit('Shorted', DC(5), GND());              // ❌ both terminals on one net
Circuit('L short', DC(5), L(mH(10)), GND());   // ❌ inductor is a DC short
Circuit('Safe',    DC(5), R(330), LED(RED), GND());  // ✅
```

### `ERC_NO_CURRENT_LIMIT` / `ERC_CURRENT_EXCEEDED`

These two split the old "LED without a resistor" check into the two distinct failures:

- **`ERC_NO_CURRENT_LIMIT`** — nothing limits the current at all. Current is unbounded.
- **`ERC_CURRENT_EXCEEDED`** — there *is* a resistor, but the computed current is over the rating.

The current is computed by tracing the supply and the ground return on either side of the
device: `I = (Vsupply − Vf) / Rseries`.

```ts
// ❌ ERC_CURRENT_EXCEEDED — (12 − 1.8) / 47 ≈ 217 mA, rated 20 mA
Circuit('Too hot', { autoGround: false }, [
  [VCC(12), r.p1], [r.p2, led.anode], [led.cathode, GND()],
]);
// ↳ Increase the series resistance to at least 638Ω.
```

The rating comes from the component when it carries one, so a power LED is judged
on its own spec:

```ts
LED({ color: GREEN, maxCurrent: 0.35 })   // 350 mA part — 217 mA is fine
```

### `ERC_REVERSE_POLARITY`

Potentials are traced **through series passives**, not just from directly attached
supplies. This catches reversals that a direct-attachment check misses:

```ts
// ❌ Caught: neither terminal touches a source directly
const d = D();
Circuit('Reversed', { autoGround: false }, [
  [VCC(5), d.cathode],
  [d.anode, R(kOhm(1)), GND()],
]);
// ↳ D1: anode sits at 0V and cathode at 5V. The Diode is reverse-biased.
```

**AC sources are exempt.** Under AC the polarity reverses every half cycle — in a
rectifier, half the diodes being reverse-biased at any instant *is* the circuit.
A net whose potential comes from an AC source is skipped by this rule.

---

## Path analysis is polarity-aware

Path searches respect diode direction. Without this, four diodes in a bridge
would look like a dead short from supply to return:

| Direction | Meaning | Diode entered at |
|---|---|---|
| `downstream` | Follow conventional current (shorts, ground paths) | anode |
| `upstream` | Trace back towards a source (supply searches) | cathode |
| `either` | Ignore polarity (feedback networks, connectivity) | — |

```ts
// A textbook bridge rectifier passes ERC with zero errors.
Circuit('Bridge', [
  [src.p, d1.anode, d2.cathode],
  [src.n, d3.anode, d4.cathode],
  [d1.cathode, d3.cathode, load.p1, smoothing.p1],
  [d2.anode,   d4.anode,   load.p2, smoothing.p2, gnd.gnd],
]);
```

### AC coupling

A capacitor in series with an **AC** source is the intended topology, so
`ERC_NO_LOAD` reports `info` there. The same capacitor blocking a **DC** source
stays a `warning` — that one is usually a mistake.

```ts
Circuit('RC', AC(5, 1000), R(kOhm(1)), C(uF(0.1)), GND());  // 🔵 info, passes
Circuit('DC', DC(5),       C(uF(1)),   GND());              // 🟡 warning
```

### `ERC_FLOATING_INPUT`

Fires in both floating cases:

1. The input pin is wired to **nothing at all**.
2. The input is wired, but **nothing on its net drives it**.

A pull-up or pull-down to a rail counts as a driver, so biasing networks do not
produce false positives.

```ts
Circuit('Pulled up', { autoGround: false }, [
  [HIGH(), and1.A],
  [VCC(5), R(kOhm(10)), and1.B],   // ✅ level is defined
  [and1.Y, R(kOhm(1)), GND()],
]);
```

### `ERC_LOGIC_LEVEL_MISMATCH`

Checks the applied voltage against the absolute-maximum rating of the gate's family
(`NOT('74HC')`, `NOT('CD4000')`, …):

| Family | Max VCC |
|---|---|
| 74HC / 74AC | 6 V |
| 74HCT / 74ACT | 5.5 V |
| 74LS / 74S / 74F | 7 V |
| CD4000 / HEF4000 | 18 V |

```ts
Circuit('Overvolt', { autoGround: false }, [[VCC(12), NOT().A], …]);
// ❌ NOT1.A: driven to 12V, above the 6V absolute maximum for the 74HC family.

Circuit('Fine', { autoGround: false }, [[VCC(12), NOT('CD4000').A], …]);   // ✅
```

### `ERC_BJT_NO_BASE_RESISTOR`

A base-emitter junction is a forward diode. Driving it straight from a rail means
unlimited base current.

```ts
Circuit('Bad',  { autoGround: false }, [ … , [VCC(5), t.B]]);              // ❌
Circuit('Good', [ … , [DC(5), R(kOhm(10)), t.B]]);                         // ✅
```

MOSFET gates draw no DC current, so this rule does not apply to them — they are covered
by `ERC_MOSFET_GATE_UNDEFINED` instead.

---

## CLI

```bash
wirescript erc <input> [options]     # alias: check
wirescript rules [--json]
```

Works on every input format: `.ws`, `.ts`, `.js`, SPICE `.net`/`.cir`/`.sp`, and DB `.json`/`.csv`.

| Flag | Description |
|---|---|
| `--preset <p>` | `strict` \| `balanced` (default) \| `relaxed` |
| `--off <keys>` | Disable rules, comma-separated |
| `--severity <k>=<v>` | Override severity: `error`\|`warning`\|`info`\|`off` |
| `--fan-out <n>` | Logic fan-out limit |
| `--resistor-power <w>` | Assumed resistor rating in watts |
| `--json` | Machine-readable output |
| `--quiet` | One line per violation, no hints |
| `--strict-exit` | Exit 1 on warnings too |
| `--out <file>` | Write to a file instead of stdout |

Exit code is **1** when any error-severity violation is found, which makes it a drop-in CI gate:

```yaml
- run: npx wirescript erc circuits/*.ws --preset strict
```

```bash
# Ignore design-quality notes, fail on anything else
wirescript erc board.ws --off missingDecoupling,opAmpNoFeedback --strict-exit
```

---

## Extending

Rules are plain objects. The registry is exported, so tooling can enumerate them:

```ts
import { ERC_RULES, getERCRule, listERCRules } from '@ssevindikx/wirescript';

listERCRules();                   // [{ key, id, name, description, severity }, …]
getERCRule('ERC_FAN_OUT')?.key;   // 'fanOut'
```

A rule receives an `ERCContext` — the derived net graph — and returns findings:

```ts
interface ERCRule {
  key: ERCRuleKey;
  id: string;                                    // 'ERC_MY_RULE'
  name: string;
  description: string;
  severity: Record<ERCPreset, ERCSeverityOverride>;
  check(ctx: ERCContext, options: ResolvedERCOptions): ERCFinding[];
}
```

`ERCContext` gives rules the facts they need without re-deriving them:

```ts
ctx.nets                              // Net[] — pins, kind, estimated potential
ctx.netOf(pin)                        // the net a pin sits on
ctx.unconnectedPins                   // every pin attached to nothing
ctx.hasGround                         // is there a 0V reference?
ctx.driversOn(net)                    // pins actively driving a net
ctx.findSupplyPath(net, opts)         // nearest net with a known potential
ctx.findGroundPath(net)               // lowest-resistance route to ground
ctx.findResistivePath(a, b)           // route between two named nets
ctx.hasConductivePath(a, b)           // could DC ever flow, incl. through actives
```

---

## Pin electrical types

ERC reasons about `PinType`, not `PinDirection`. Direction describes signal flow;
type describes what the pin does electrically — which is why a voltage source's
negative terminal (`direction: Input`) is a `PowerOut` and never reported as a
floating input.

| `PinType` | Meaning | Used by |
|---|---|---|
| `PowerOut` | Supplies power / defines a potential | `DC`, `AC`, `VCC`, `GND`, `HIGH`, `LOW` |
| `PowerIn` | Consumes power, must be driven | OpAmp `vPos` / `vNeg` |
| `Input` | Signal input, needs a driver | Gate `A`/`B`, OpAmp `inP`/`inN` |
| `Output` | Signal output, drives its net | Gate `Y`, OpAmp `out`, `CLK` |
| `Passive` | No electrical direction | R, C, L, diodes, transistor terminals |
| `Bidirectional` | Drives or is driven | bus pins |
| `OpenCollector` / `TriState` | May legally share a net | — |
| `NoConnect` | Must be left unconnected | — |
| `Unspecified` | Unknown; treated conservatively | — |

---

## `Schematic.validate()`

`validate()` is a flat-string view over the same engine:

```ts
const { valid, errors, warnings } = circuit.validate();
// errors: ['[ERC_NO_GROUND] Circuit has no ground (GND) reference. …']
```

`valid` is `result.passed`; `errors` and `warnings` are the ERC violations of
that severity, formatted as `[RULE_ID] message`. `info` findings are omitted —
they are design notes, not validation failures.

Prefer `erc()` for new code: it reports the affected components, nodes and pins,
tells you how to fix each finding, and lets you tune severity.

> **Changed in 0.5.0.** `validate()` used to run its own, laxer checks — an
> unconnected pin was a warning there and an error in ERC. The two can no longer
> disagree.

---

## Limits

ERC is a **static** check. It does not solve the circuit, so it deliberately does not
report what it cannot know:

- Node potentials are derived from directly attached supplies and traced through series
  passives. A potential that only a solver could find is left `undefined`, and rules
  that depend on it skip that net rather than guess.
- Traversal stops at transistors and ICs for impedance queries — a static check cannot
  know whether such a device is conducting. `hasConductivePath` is the deliberate
  exception, used by rules that must not fire when a plausible path exists.
- AC behaviour, timing, thermal coupling and EMI are out of scope.

For anything beyond this, export a SPICE netlist and simulate:

```bash
wirescript to-netlist circuit.ws --out circuit.net
```
