# Logic Gates

WireLang includes simple logic gate factories and helpers for creating small digital circuits and tests.

## Gate factories

- `NOT()` — inverter.
- `AND()`, `OR()`, `XOR()`, `NAND()`, `NOR()` — multi-input logic gates.

## Input helpers

- `HIGH()` / `LOW()` — constant logic levels.
- `CLK(frequency)` / `CLK(kHz(x))` — clock source helper.

Example from `playground.ts`

```ts
import { XOR, CLK, HIGH, LED, GREEN, LOW, Circuit } from '../core';

const xor1 = XOR();
const xorCircuit = Circuit('XOR Gate', { autoGround: false }, [
  [CLK(1000), xor1.A],
  [HIGH(), xor1.B],
  [xor1.Y, LED(GREEN), LOW()],
]);
```

Notes

- Many examples disable `autoGround` to show explicit ground wiring.
- Gates are pure logical abstractions and can be combined with LED components for visual tests.
