# WireScript Architecture

This document provides a comprehensive overview of the architecture and internal design of **WireScript**, a code-first Domain Specific Language (DSL) for describing electronic circuits in TypeScript.

## 1. Introduction & Mission

WireScript bridges the gap between software engineering and hardware design. Instead of drawing schematics visually in EDA (Electronic Design Automation) tools, engineers can *code* their circuits. This enables version control, programmatic generation of repetitive blocks, and integration with modern software CI/CD pipelines.

The core mission of WireScript is to provide:
1. A robust **Intermediate Representation (IR)** for circuit topology.
2. An elegant, declarative **DSL** for fast circuit authoring.
3. A strict **Electrical Rule Check (ERC)** engine to catch physics-level errors early.
4. **Interoperability** with standard EDA tools via netlists (SPICE).

---

## 2. High-Level Architecture

The system is built as a series of modular layers:

1. **API Layer**: The developer-facing interface (Imperative TypeScript API & Declarative DSL).
2. **Core Domain Model (IR)**: The in-memory graph representing the circuit topology (`Schematic`, `Node`, `Component`, `Pin`).
3. **Validation Engine**: The Electrical Rule Checker (`erc.ts`) which analyzes the IR graph.
4. **I/O & Interoperability**: 
   - `db.ts`: JSON serialization/deserialization.
   - `netlist.ts`: SPICE & CSV netlist generation/parsing.
5. **CLI**: Command-line tools for compiling and decompiling designs.

---

## 3. Core Domain Model (The IR)

At the heart of WireScript is an object-oriented representation of an electronic circuit. This is the Intermediate Representation (IR).

### `Schematic`
The `Schematic` class acts as the top-level container for a single circuit. It maintains lists of all `Component`s and `Node`s. It is responsible for routing connections, finding unconnected pins, and merging ground nodes. 
- Conceptually, it is the abstract syntax tree (AST) of the hardware design.

### `Component` & `Pin`
- **`Component`**: Represents a physical electronic part (e.g., Resistor, Capacitor, BJT, OpAmp). It holds parameters (value, unit, model) and owns a collection of `Pin`s. Built-in components are organized in the `core/components/` directory.
- **`Pin`**: Represents a physical terminal on a component (e.g., Anode, Cathode, Base). A Pin can only connect to exactly one `Node`.

### `Node`
A `Node` represents an equipotential net (a junction where wires meet). Multiple pins from different components can connect to the same `Node`. 
- WireScript automatically infers nodes when using the DSL, eliminating the need to manually name every wire in the circuit.
- There is a special handling for the **Ground Node**, ensuring all ground references share the same 0V potential.

---

## 4. API Layers

WireScript offers two distinct ways to author circuits, catering to different complexity levels.

### 4.1 The DSL API (Declarative)
Located in `core/dsl.ts`, this layer provides syntactic sugar to build circuits rapidly.
- **`Circuit()`**: The entry point that creates a `Schematic`.
- **`Series()`**: Connects components end-to-end. The second pin of component A connects to the first pin of component B.
- **`Parallel()`**: Connects components side-by-side. All first pins connect to node X, all second pins to node Y.

*Example:*
```typescript
Circuit('Voltage Divider', Series(DC(9), R(kOhm(10)), R(kOhm(10)), GND()));
```

### 4.2 The TypeScript API (Imperative)
For complex routing (e.g., multi-pin ICs, microcontrollers) where Series/Parallel semantics break down, the imperative API provides fine-grained control.
- `createSchematic()`
- `schematic.addComponent()`
- `schematic.connect(pin, node)`

---

## 5. Electrical Rule Check (ERC) Engine

The ERC engine performs physics-based validation over the `Schematic` graph before a circuit
is exported or manufactured. It is split into four modules so that the facts a rule checks
against are derived once, in one place:

```
core/erc.ts                  Public API: ERCResult, runERC, rule registry, severity resolution
core/erc-types.ts            Shared contracts (ERCRule, ERCFinding, ERCViolation, options)
core/erc-model.ts            ERCContext — the derived net graph and all path queries
core/erc-rules-topology.ts   17 connectivity and power-distribution rules
core/erc-rules-device.ts     14 device-physics rules
```

### 5.1 The analysis model (`ERCContext`)

Rules never walk the raw `Schematic`. They receive an `ERCContext`, which derives:

- **Nets** — pins grouped by node, each classified `ground` / `power` / `signal`, carrying an
  estimated DC potential where one can be derived from an attached supply.
- **A DC impedance model** — what each two-terminal component does to a path passing through
  it. This is what makes short detection correct: an inductor is a DC short, a capacitor is a
  DC open, a 0 Ω resistor is a wire, and a forward diode drops voltage without limiting current.
- **Path queries** — `findSupplyPath` (nearest net with a known potential),
  `findGroundPath`, `findResistivePath` (route between two named nets), and
  `hasConductivePath` (could DC ever flow, including through transistors and ICs).

The last distinction matters: impedance queries stop at active devices, because a static check
cannot know whether a transistor is conducting. `hasConductivePath` is the deliberate exception,
used by rules that must *not* fire when a plausible path exists.

### 5.2 Pin electrical types

ERC reasons about `PinType`, not `PinDirection`. Direction describes signal flow; type describes
what a pin does electrically. A voltage source's negative terminal has `direction: Input` but is
a `PowerOut` — without that distinction it would be reported as a floating input on every
circuit. Types: `PowerIn`, `PowerOut`, `Input`, `Output`, `Bidirectional`, `OpenCollector`,
`TriState`, `Passive`, `NoConnect`, `Unspecified`.

### 5.3 Rules and severity

A rule is a plain object: an id, a key, a description, a severity per preset, and a `check`
function returning findings. The registry (`ERC_RULES`) is exported, so tooling can enumerate
rules without running them.

Severity is resolved by the engine, not baked into the rule's output:

```
explicit severity override  →  rules on/off flag  →  preset (strict | balanced | relaxed)
```

This means the same rule set serves an exploratory sketch and a pre-manufacture CI gate.

**Rule coverage (31 rules):**

| Group | Rules |
|---|---|
| Topology | empty circuit, no ground, unconnected pin, dangling net, duplicate refdes, isolated section, no-connect wired, invalid value |
| Power | short circuit, supply short, power conflict, output conflict, missing power pin, power input not driven, floating input, no load, driver conflict |
| Devices | reverse polarity, no current limit, current exceeded, voltage exceeded, power dissipation, fan-out, logic level mismatch, transistor no drive, transistor terminal floating, BJT base resistor, MOSFET gate undefined, op-amp output shorted, op-amp no feedback, missing decoupling |

`runERC` returns an `ERCResult` with `passed`, severity-partitioned violations, `byRule()`
lookup, a human `report()` with fix hints, and `toJSON()` for tooling.

---

## 6. Interoperability & I/O

WireScript is designed to fit into existing hardware engineering workflows. It does not reinvent simulation; instead, it delegates to established tools.

### `db.ts` (JSON Serialization)
Converts the in-memory `Schematic` object graph into a strict, flat JSON format (`wirescript-db@v1`). This format allows circuits to be saved to disk, version-controlled, or sent over a network API without losing fidelity.

### `netlist.ts` (SPICE & CSV)
The netlist generator bridges WireScript to simulation and PCB layout tools.
- **SPICE Export/Import**: Converts the `Schematic` into standard SPICE netlists (`.net`, `.cir`, `.sp`) which can be simulated in LTspice, Ngspice, or Xyce. It automatically maps Component Types to SPICE prefixes (e.g., `Resistor` -> `R`, `VoltageSource` -> `V`).
- **CSV Netlists**: Useful for custom BOM (Bill of Materials) generation or integration with proprietary ERP/PLM systems.

---

## 7. CLI Tool

Located in `core/cli.ts`, the CLI exposes WireScript's capabilities to the shell.
- **`wirescript convert <input> --to <format>`**: Universal converter between all formats.
- **`wirescript compile <file.ts>`**: Evaluates a WireScript TypeScript file and outputs the compiled JSON IR or SPICE netlist.
- **`wirescript decompile <file.json>`**: Reads a compiled JSON database and reconstructs the equivalent DSL or TypeScript code.
- **`wirescript erc <input>`**: Runs the Electrical Rule Check on any input format. Exits `1`
  when an error-severity violation is found, making it a drop-in CI gate.
- **`wirescript rules`**: Prints the rule catalogue with default severities.

Commands that need the live IR rather than the DB go through `loadSchematic()`, which evaluates
`.ts`/`.ws` sources directly and normalises every other format through the DB backbone.

---

## 8. Directory Layout

A quick overview of the repository structure:

```
wirescript/
├── core/                # The heart of the compiler and IR
│   ├── components/      # Implementations of specific electronic parts
│   ├── Component.ts     # Base component class
│   ├── Schematic.ts     # The IR graph container
│   ├── Node.ts          # Equipotential nets
│   ├── Pin.ts           # Component terminals
│   ├── dsl.ts           # Declarative syntax helpers (Series, Parallel)
│   ├── erc.ts           # ERC public API, rule registry, severity resolution
│   ├── erc-types.ts     # ERC shared contracts
│   ├── erc-model.ts     # ERC analysis model (nets, impedance, path queries)
│   ├── erc-rules-topology.ts  # Connectivity & power rules
│   ├── erc-rules-device.ts    # Device-physics rules
│   ├── db.ts            # JSON serialization (v1 IR)
│   ├── netlist.ts       # SPICE / CSV import and export
│   ├── cli.ts           # Command-line interface implementation
│   ├── units.ts         # SI prefix helpers (kOhm, uF, MHz)
│   └── types.ts         # Enums and global types
├── docs/                # Comprehensive markdown documentation
├── tests/               # Unit tests using Vitest
├── package.json         # NPM configuration and scripts
├── playground.ts        # Scratchpad for testing circuits
└── run-examples.js      # Script to execute the example circuits
```
