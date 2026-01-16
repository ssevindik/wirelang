# Passive Components

This page documents resistors, capacitors and inductors and how units are expressed.

## Resistor

- `R(value)` — create a resistor with numeric ohm value or helper-wrapped units like `kOhm(10)`.

Example

```ts
import { R, kOhm } from '../core';

const r = R(kOhm(10)); // 10 kΩ
```

## Capacitor

- `C(value)` — capacitor with farad value; typical usage uses `uF` helper.

Example

```ts
import { C, uF } from '../core';

const c = C(uF(0.1)); // 0.1 µF
```

## Inductor

- `L(value)` — in henry; use `mH` helper in examples.

Example

```ts
import { L, mH } from '../core';

const l = L(mH(10));
```

## Notes

- Units helpers are described on the `Units` page: [Units](./units.md).
- These components are intended to be placed in `Circuit`, `Series`, or `Parallel` constructs.
