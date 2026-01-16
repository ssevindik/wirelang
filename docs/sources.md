# Sources

WireLang provides factories for voltage and current sources as well as named power rails.

## Voltage Sources

- `DC(voltage: number)` — DC voltage source. Example: `DC(5)` creates a 5V source.
- `AC(amplitude: number, frequency?: number)` — AC source. Example: `AC(5, 60)`.

Power rails (convenience factories)

- `VCC(value?)`, `VDD`, `VPOS` — positive supply helpers.
- `VNEG(value?)`, `VSS`, `VEE` — negative supply helpers.

## Current Sources

- `IDC(value)` / `IAC(value, freq?)` — current source helpers (exported from components index).

Usage Example

```ts
import { Circuit, DC, VCC, VNEG, R, GND } from '../core';

const s = Circuit('Simple', [
  [VCC(9), R(1000), GND()]
]);
```

Notes

- Sources can be used directly inside `Series`/`Parallel` or `Circuit` calls.
- Some example circuits create nodes manually and wire sources by pin names (see `core/examples.ts`).
