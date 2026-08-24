# CLI Reference

WireScript CLI — **three exchange formats**, one backbone (DB):

```
.ws (WireScript DSL)  ◄───►  WireScriptDb  ◄───►  .net (SPICE Netlist)
                                   │
                          .json / .csv (DB storage)
```

## Installation

```sh
npm install -g @ssevindikx/wirescript
# or via npx:
npx wirescript <command>
```

---

## `convert` — Universal Converter

Convert between any two formats with a single command.

```sh
wirescript convert <input> --to <format> [options]
```

### `--to` values

| Value | Output format |
|---|---|
| `ws` | WireScript DSL (`.ws`) |
| `netlist` | SPICE netlist (`.net`) |
| `db` | DB JSON (`.json`) |
| `db-csv` | DB CSV (`.csv`) |
| `ts` | TypeScript module |

### Options

| Flag | Description |
|---|---|
| `--to <format>` | Target format (required) |
| `--from <format>` | Force input format (optional, usually auto-detected) |
| `--out <file>` | Write output to file (default: stdout) |
| `--name <name>` | Override schematic name |
| `--title <title>` | SPICE netlist title comment |
| `--export <name>` | TypeScript module export name |
| `--import <path>` | TypeScript module import path |

### Examples

```sh
# .ws → SPICE netlist
wirescript convert circuit.ws --to netlist --out circuit.net

# SPICE netlist → .ws
wirescript convert circuit.net --to ws --out circuit.ws

# .ws → DB JSON
wirescript convert circuit.ws --to db --out circuit.json

# .json → DB CSV
wirescript convert circuit.json --to db-csv --out circuit.db.csv

# .csv → .ws
wirescript convert circuit.db.csv --to ws

# .ts module → netlist (direct, no intermediate JSON needed)
wirescript convert my-circuit.ts --to netlist --out circuit.net

# Force input format (when auto-detection is ambiguous)
wirescript convert circuit.txt --from netlist --to ws
```

---

## Shorthand Commands

### `to-ws` — Any format → `.ws`

```sh
wirescript to-ws <input> [--out file.ws] [--name "..."]
```

```sh
wirescript to-ws circuit.json
wirescript to-ws circuit.net --out circuit.ws
wirescript to-ws circuit.db.csv
```

### `from-ws` — `.ws` → DB JSON

```sh
wirescript from-ws <input.ws> [--out file.json]
```

```sh
wirescript from-ws circuit.ws
wirescript from-ws circuit.ws --out circuit.json
```

### `to-netlist` — Any format → SPICE netlist

```sh
wirescript to-netlist <input> [--out file.net] [--title "..."]
```

```sh
wirescript to-netlist circuit.json --out circuit.net
wirescript to-netlist circuit.ws --title "LED Driver v2"
wirescript to-netlist circuit.db.csv
```

### `from-netlist` — SPICE netlist → DB JSON

```sh
wirescript from-netlist <input.net> [--out file.json] [--name "..."]
```

```sh
wirescript from-netlist circuit.net
wirescript from-netlist circuit.net --out circuit.json --name "My Circuit"
```

### `to-db` — Any format → DB (JSON or CSV)

```sh
wirescript to-db <input> [--format json|csv] [--out file]
```

```sh
wirescript to-db circuit.ws --format csv --out circuit.db.csv
wirescript to-db circuit.net --format json
```

### `compile` — `.ts`/`.ws` → DB JSON *(legacy alias)*

```sh
wirescript compile <input.ts|input.ws> [--out file.json]
```

```sh
wirescript compile my-circuit.ts --out circuit.json
wirescript compile circuit.ws --out circuit.json
```

The `.ts` input file must export a `Schematic` as its default export:

```ts
// my-circuit.ts
import { Circuit, DC, R, LED, GND, RED } from '@ssevindikx/wirescript';
export default Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
```

### `decompile` — DB JSON/CSV → `.ws` or `.ts` *(legacy alias)*

```sh
wirescript decompile <input.json> [--format ws|ts] [--out file]
```

```sh
wirescript decompile circuit.json
wirescript decompile circuit.json --format ts --out circuit.ts
wirescript decompile circuit.json --format ws --out circuit.ws
```

---

## `erc` — Electrical Rule Check

Run the [Electrical Rule Check](./erc.md) against any input format.

```sh
wirescript erc <input> [options]     # alias: check
```

Accepts `.ws`, `.ts`, `.js`, SPICE `.net`/`.cir`/`.sp`, and DB `.json`/`.csv`.

### Options

| Flag | Description |
|---|---|
| `--preset <p>` | `strict` \| `balanced` (default) \| `relaxed` |
| `--off <keys>` | Disable rules, comma-separated (`--off fanOut,missingDecoupling`) |
| `--severity <k>=<v>` | Override severity: `error`\|`warning`\|`info`\|`off` |
| `--fan-out <n>` | Logic fan-out limit (default `10`) |
| `--resistor-power <w>` | Assumed resistor rating in watts (default `0.25`) |
| `--json` | Machine-readable output |
| `--quiet` | One line per violation, no fix hints |
| `--strict-exit` | Exit 1 on warnings too |
| `--out <file>` | Write to a file instead of stdout |
| `--from <format>` | Force input format |

**Exit code is `1` when any error-severity violation is found**, so it works as a CI gate
with no extra scripting.

```sh
wirescript erc circuit.ws
wirescript erc circuit.ts --preset strict --strict-exit
wirescript erc circuit.net --off missingDecoupling --json --out erc.json
```

```yaml
# GitHub Actions
- run: npx wirescript erc circuits/*.ws --preset strict
```

---

## `rules` — List ERC rules

```sh
wirescript rules            # table of every rule, key and default severity
wirescript rules --json     # same catalogue as JSON
```

```
WireScript ERC — 31 rules

  RULE                       KEY                 BALANCED  DESCRIPTION
  ERC_EMPTY_CIRCUIT          emptyCircuit        error     The schematic contains no components.
  ERC_NO_GROUND              noGround            error     The circuit has no 0V reference, …
  …
```

---

## Pipeline Examples

All commands compose via stdin/stdout:

```sh
# .ws → netlist (single step)
wirescript convert circuit.ws --to netlist --out circuit.net

# .ts → .ws (compile + decompile)
wirescript compile my-circuit.ts | wirescript decompile /dev/stdin --format ws

# netlist → .ws (net → DB → ws)
wirescript from-netlist circuit.net | wirescript to-ws /dev/stdin --out circuit.ws

# Full round-trip: .ws → netlist → ws
wirescript convert circuit.ws --to netlist \
  | wirescript convert /dev/stdin --from netlist --to ws

# .ts → DB CSV
wirescript compile my-circuit.ts \
  | wirescript to-db /dev/stdin --format csv --out circuit.db.csv

# Validate before exporting for manufacture
wirescript erc circuit.ws --preset strict \
  && wirescript convert circuit.ws --to netlist --out circuit.net
```

---

## Command Summary

| Command | Alias | Input | Output |
|---|---|---|---|
| `convert --to ws` | `to-ws` | any | `.ws` |
| `convert --to netlist` | `to-netlist` | any | `.net` |
| `convert --to db` | `to-db` | any | `.json` |
| `convert --to db-csv` | — | any | `.csv` |
| `convert --to ts` | — | any | `.ts` |
| `compile` | `dsl2db` | `.ts`/`.ws` | `.json` |
| `decompile` | `db2dsl` | `.json`/`.csv` | `.ws`/`.ts` |
| `from-ws` | — | `.ws` | `.json` |
| `from-netlist` | `import-netlist` | `.net` | `.json` |
| `erc` | `check` | any | report / JSON (exit 1 on error) |
| `rules` | — | — | rule catalogue |

---

## Programmatic Usage

All CLI functions are also available as a library:

```ts
import {
  // DB backbone
  compileDslToDb, serializeDb, deserializeDb,

  // WireScript DSL (.ws)
  exportWs, importWs,

  // SPICE Netlist
  exportNetlist, importNetlist,

  // DB → DSL code
  reverseDbToDsl,
} from '@ssevindikx/wirescript';

// Example: .ws → SPICE (via API)
const db    = importWs(wsSource);       // ws → DB
const spice = exportNetlist(db);         // DB → netlist

// Example: save/load DB
const csv = serializeDb(db, { format: 'csv' });  // DB → CSV
const db2 = deserializeDb(csv);                   // CSV → DB (auto-detected)
```

See [IO & Formats](./io.md) and [Serialization](./serialization.md) for full API details.
