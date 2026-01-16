# Units

Helper functions are provided to express common electrical units in a readable way.

Common helpers (examples)

- `kOhm(value)` — kilohms. Example: `kOhm(10)` → 10000 Ω.
- `uF(value)` — microfarads. Example: `uF(0.1)` → 0.1 µF.
- `mH(value)` — millihenry. Example: `mH(10)` → 10 mH.
- `kHz(value)` — kilohertz for clock/frequency helpers.

Usage

```ts
import { R, kOhm, C, uF, CLK, kHz } from '../core';

const r = R(kOhm(1));
const c = C(uF(0.01));
const clock = CLK(kHz(1));
```

Notes

- Unit helpers make examples easier to read and less error-prone than raw numbers.
