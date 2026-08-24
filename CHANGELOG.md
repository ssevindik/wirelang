# Changelog

All notable changes to WireScript are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as scoped in [Versioning policy](./README.md#versioning-policy).

---

## [0.5.0] — Unreleased

The breaking window before `1.0.0-rc.1`. Every change that would force a major
version bump later lands here, together, so there is one migration to read
instead of four.

### Breaking

- **Transistors carry their own `ComponentType`.** `NPN()` is now
  `ComponentType.NPN` rather than `ComponentType.BJT`; likewise `PNP`, `NMOS`
  and `PMOS`. The generic `ComponentType.BJT` and `ComponentType.MOSFET` are
  deprecated and no component emits them.

  `wirescript-db@v1` files written before 0.5.0 still load — deserialization
  maps the legacy type to the specific one using `params.transistorType`.

  ```ts
  // before
  if (component.type === ComponentType.BJT && component.params.transistorType === 'PNP') …
  // after
  if (component.type === ComponentType.PNP) …
  ```

- **`Schematic.validate()` delegates to ERC.** One engine now decides what is
  wrong; `validate()` formats the result into the legacy
  `{ valid, errors, warnings }` shape. Findings that were warnings are errors
  where ERC says so — an unconnected pin and a missing ground reference both
  now fail `validate()`. Messages are prefixed with their rule id
  (`[ERC_NO_GROUND] …`). Prefer `schematic.erc()` for new code.

- **SPICE export emits power rails.** `VCC()` and `VDD()` were silently dropped,
  so an exported netlist had no supply in it and simulated as a dead circuit.
  They are now written as voltage sources against net 0
  (`VCC1 node_3 0 5`) and annotated so import restores them as rails.

- **SPICE export uses SPICE terminal order.** Transistors were emitted in
  WireScript's declaration order (`B, C, E`), which SPICE reads as
  `collector, base, emitter` — so every exported netlist had collector and base
  swapped. Elements are now ordered `C B E` for `Q` and `D G S` for `M`/`J`.

- **SPICE import uses WireScript pin names.** Imported transistors had pins
  named `collector` / `base` / `emitter` and op-amps `out` / `in+` / `in-`,
  none of which match the components — so `component.getPin()` could not
  resolve them. They are now `C`/`B`/`E`, `D`/`G`/`S` and
  `inP`/`inN`/`out`/`vPos`/`vNeg`.

- **`PMOS()` threshold voltage is negative.** `PMOS().vth` returned `+2` while
  `params.value` held `-2`. Both are now `-2`, and `PMOS.validate()` no longer
  reports a legitimate negative threshold as an invalid value.

- **JFETs use the `J` reference designator**, matching the SPICE element, rather
  than sharing `M` with MOSFETs. Only affects JFETs, which are new in this
  release.

### Added

- **`dbToSchematic(db)`** — rebuild a live `Schematic` from a `WireScriptDb`,
  closing the DB round-trip. Component ids, labels, pin ids and node ids are
  preserved, so `compileDslToDb(dbToSchematic(db))` reproduces `db`. Aliased as
  `db2schematic`. The CLI no longer reaches the IR by generating and evaluating
  source code.
- **JFET components** — `NJFET()` and `PJFET()`, with models for 2N3819,
  2N5457, 2N5458, J201, BF245, 2N5460, 2N5461 and J270. They export to SPICE as
  `J` elements.
- **`resolveComponentType(dbComponent)`** — resolves a DB record's type,
  mapping legacy generic transistor types onto the specific type they meant.
- **`Ground().p1` / `Ground().p2`** — both return the single ground pin, so a
  `GND()` placed mid-chain in `Series()` no longer reads `undefined`.
- **AC sources round-trip through SPICE.** An AC source is written as
  `SIN(0 <amplitude> <frequency>)` rather than a bare number, so it does not
  come back as DC — which previously made a re-imported bridge rectifier report
  `ERC_REVERSE_POLARITY`.
- **Exact component types survive SPICE.** A `* Devices:` annotation records
  each element's WireScript type, so an LED comes back an LED rather than a
  plain diode, and a PNP comes back a PNP.
- **API surface test** — `tests/api-surface.test.ts` pins the exact set of
  public exports. Removing or renaming one now fails the build.

### Fixed

- `ERC_FLOATING_INPUT` no longer fires on an input driven through a series
  passive. An inverting op-amp's inverting input, fed back through a resistor
  from the op-amp's own output, is driven — not floating.
- `ERC_TRANSISTOR_NO_DRIVE` likewise accepts a base or gate driven through a
  series resistor.
- SPICE import parses a variable terminal count, so a 2-terminal inverter, a
  3-terminal MOSFET, a 4-terminal MOSFET with a bulk connection and a 5-pin
  op-amp all parse correctly from the same code path.
- A logic gate's SPICE element now names its function (`AND_74HC`) instead of
  repeating its input count, and imports back as the same gate.
- Part numbers that begin with a digit (`2N3819`, `1N4007`) are no longer
  mistaken for numeric values on SPICE import, which silently dropped the model
  and zeroed the device parameters.
- `Schematic.validate()` no longer reports `Unconnected pin: 1` — pin names in
  messages are qualified with their component (`R1.1`).

---

## [0.4.0] — Unreleased

The ERC release. Circuits that quietly passed before will now fail — that is
the point of the release.

### Breaking

- **ERC severities changed.** Faults that reported `warning`, or nothing at
  all, now report `error`. Anything gating on `result.passed` should expect new
  failures. Use `preset: 'relaxed'` or per-rule `severity` overrides to pin the
  old behaviour.
- **`runERC` options changed shape.** `rules` is still an on/off map, joined by
  `preset` and a per-rule `severity` map.

### Added

- **31 ERC rules**, up from 12, across topology, power distribution and device
  physics. `wirescript rules` lists them.
- **Severity presets** — `strict`, `balanced` (default) and `relaxed`, with
  per-rule overrides by rule key or `ERC_*` id, and `'off'` to disable.
- **Fix hints.** Every violation carries the computed numbers and a concrete
  remedy: *"Increase the series resistance to at least 638Ω."*
- **`wirescript erc <input>`** — runs ERC on any input format and exits `1` on
  an error, making it a CI gate with no wrapper script. `--json`, `--quiet`,
  `--preset`, `--off`, `--severity` and `--strict-exit` are supported.
- **`wirescript rules`** — prints the rule catalogue with default severities;
  `--json` for tooling.
- **`ERCResult` API** — `byRule()`, `has()`, `counts`, `report()` and
  `toJSON()` alongside the existing `summary()`.
- **A real analysis model.** Rules receive an `ERCContext` carrying the net
  graph, a DC impedance model and polarity-aware path queries, rather than
  walking the raw schematic.
- **Pin electrical types** (`PinType`) separate from `PinDirection`. A voltage
  source's negative terminal flows "in" but is a `PowerOut`, so it is no longer
  reported as a floating input.

### Fixed

Faults that previously produced no violation at all:

- A power rail wired directly to ground — the short-circuit search only ever
  compared a source's own two pins.
- An unconnected input pin — the floating-input check skipped exactly the case
  it existed to catch.
- An op-amp output tied to a supply rail.
- A reversed diode seen through a series resistor.
- A component with both terminals wired to nothing.
- An inductor across a supply. There was no DC impedance model, and an ideal
  inductor is a short at DC.

Bugs found by turning the rules on, none of them in the ERC code:

- **`Parallel()` inside `Circuit()` silently disconnected the whole block.**
  `Series()` moved the block's virtual terminals onto a fresh node, orphaning
  every component in it.
- A node carrying a `GND()` component was not marked as ground, so SPICE export
  never emitted net 0.
- SPICE import dropped the ground reference entirely, so every round-tripped
  circuit came back reporting `ERC_NO_GROUND`.
- Transistors were labelled `U1` instead of `Q1` / `M1` — the reference
  designator switch tested enum members no component used.
- Every power rail was labelled `VCC`, so two rails in one circuit were
  indistinguishable in netlist export.
- `OpAmp`, `LogicHigh`, `LogicLow` and `ClockSource` used string literals cast
  to `ComponentType` rather than enum members.
- Four shipped example circuits left the supply return unconnected.

---

## [0.3.0-alpha] — 2026-06-03

### Added

- `.ws` format support for import and export.
- Netlist import/export with SPICE and WireScript CSV.
