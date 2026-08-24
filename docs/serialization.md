# Serialization — DB Layer

WireScript includes a JSON serialization layer (`wirescript-db@v1`) that allows round-trip conversion between the runtime DSL representation and a stable, JSON-safe format.

---

## Schema: `WireScriptDb`

```ts
interface WireScriptDb {
  schema:     'wirescript-db@v1';
  name:       string;
  components: DbComponent[];
  nodes:      DbNode[];
  meta?:      Record<string, unknown>;
}

interface DbComponent {
  id:      string;
  type:    string;         // ComponentType value
  label?:  string;         // 'R1', 'LED3', etc.
  params:  ComponentParams;
  pins:    DbPin[];
  extras?: Record<string, unknown>;
}

interface DbPin {
  id:        string;
  name:      string;
  direction?: PinDirection;
  nodeId?:   string;       // Which node this pin is on
}

interface DbNode {
  id:        string;
  name?:     string;
  isGround?: boolean;
}
```

---

## `compileDslToDb(schematic)` — DSL → DB

```ts
import { Circuit, DC, R, LED, GND, RED, compileDslToDb } from '@ssevindikx/wirescript';

const circuit = Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
const db = compileDslToDb(circuit);

console.log(JSON.stringify(db, null, 2));
// {
//   "schema": "wirescript-db@v1",
//   "name": "LED Driver",
//   "components": [ ... ],
//   "nodes": [ ... ]
// }
```

The resulting object is fully JSON-serializable — no circular references.

---

## `reverseDbToDsl(db, options?)` — DB → DSL code

Converts a `WireScriptDb` object back into runnable source code.

```ts
import { reverseDbToDsl } from '@ssevindikx/wirescript';

const code = reverseDbToDsl(db);
// Returns plain DSL code string by default:
// R1 = R(330)
// LED1 = LED("red")
// ...
// Circuit("LED Driver", [...])
```

### Options

```ts
interface DbToDslOptions {
  format?:      'dsl' | 'ts';  // Output format (default: 'dsl')
  moduleImport?: string;        // Import path for 'ts' format (default: 'wirescript')
  exportName?:   string;        // Export name for 'ts' format (default: 'default')
  preserveIds?:  boolean;       // Emit applyComponentIdentity calls (default: true)
}
```

### `format: 'dsl'` (default)

Returns a simplified DSL-like pseudo-code (human-readable):

```ts
const code = reverseDbToDsl(db, { format: 'dsl' });
```

```
R1 = R(330)
LED1 = LED("red")
GND1 = GND()

Circuit(
  "LED Driver",
  [
    [R1.p1, LED1.anode],
    [R1.p2, LED1.cathode, GND1.gnd]
  ]
)
```

### `format: 'ts'`

Returns executable TypeScript that reconstructs the full schematic:

```ts
const code = reverseDbToDsl(db, {
  format: 'ts',
  moduleImport: 'wirescript',
  exportName: 'ledCircuit',
});
```

```ts
import { R, LED, GND, createSchematic, applyComponentIdentity, applyNodeIdentity } from '@ssevindikx/wirescript';

const s = createSchematic("LED Driver");

const R1 = R(330);
applyComponentIdentity(R1, { id: "resistor_1", label: "R1", pinIds: { "1": "pin_1", "2": "pin_2" } });
// ...

s.addComponents(R1, LED1, GND1);

s.connect(R1.pin("1"), node_node_1);
// ...

export const ledCircuit = s;
```

---

## `dbToSchematic(db)` — DB → the live IR

The inverse of `compileDslToDb`. Rebuilds a working `Schematic` — components,
nodes and connections — so anything downstream can start from a stored DB.

```ts
import { deserializeDb, dbToSchematic, runERC } from '@ssevindikx/wirescript';

const db = deserializeDb(await fs.readFile('circuit.json', 'utf-8'));
const schematic = dbToSchematic(db);

console.log(schematic.erc().report());
console.log(schematic.getSummary());
```

Component ids, labels, pin ids and node ids are preserved, so the round-trip is
lossless:

```ts
compileDslToDb(dbToSchematic(db))   // deep-equals db
```

Throws if a record's `type` has no known constructor — a silently dropped
component would be worse than a loud failure.

> **Before 0.5.0** there was no way back to the live IR. The CLI reached it by
> generating DSL source and evaluating it; `dbToSchematic` removes that step.

---

## Aliases

```ts
// All equivalent:
import { compileDslToDb, dslToDb, dsl2db }   from '@ssevindikx/wirescript'; // DSL → DB
import { reverseDbToDsl, dbToDsl, db2dsl }   from '@ssevindikx/wirescript'; // DB → DSL code
import { dbToSchematic, db2schematic }       from '@ssevindikx/wirescript'; // DB → Schematic
```

---

## Round-trip example

```ts
import { Circuit, DC, R, GND, compileDslToDb, reverseDbToDsl } from '@ssevindikx/wirescript';

// Build
const original = Circuit('Test', DC(5), R(1000), GND());

// Serialize
const db = compileDslToDb(original);
const json = JSON.stringify(db);

// Deserialize
const dbParsed = JSON.parse(json);
const code = reverseDbToDsl(dbParsed, { format: 'ts' });

console.log(code);
// Fully executable TypeScript that recreates the schematic
```

---

## Identity preservation

When `preserveIds: true` (default), the generated TypeScript includes `applyComponentIdentity` calls that restore the original IDs and labels. This ensures that component references remain stable across save/load cycles — critical for tools that store component IDs (e.g. WireScript Studio).

```ts
import { applyComponentIdentity, applyNodeIdentity } from '@ssevindikx/wirescript';

applyComponentIdentity(myComponent, {
  id: 'resistor_7',
  label: 'R3',
  pinIds: { '1': 'pin_14', '2': 'pin_15' },
});

applyNodeIdentity(myNode, 'node_4');
```
