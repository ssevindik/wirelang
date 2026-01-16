# Op-Amps

WireLang exposes op-amp abstractions and a few named models. There are two families shown in examples:

- 5-pin op-amp (full model) — use `OpAmp(name)` which returns an object with pins used in examples: `vPos`, `vNeg`, `inP`, `inN`, `out`.
- 3-pin op-amp (simplified) — use `OpAmp3(name)` which returns `inP`, `inN`, `out` and may be used with `autoGround: false` if needed.

API

- `OpAmp(model?: string)` — returns an op-amp component. Example models from the repo: `LM741`, `TL072`, `NE5532`, `LM358`.
- `OpAmp3(model?: string)` — simplified 3-pin model.

Typical pins (5-pin example)

- `vPos` — positive power supply pin (connect `VCC` or `VDD`).
- `vNeg` — negative power supply pin (connect `VNEG` or `VSS`).
- `inP` / `inN` — non-inverting / inverting inputs.
- `out` — output pin.

Usage Example (from `playground.ts`)

```ts
import { Circuit, OpAmp, R, AC, VCC, VNEG, GND } from '../core';

const op = OpAmp('LM741');
const Rin = R(10000);
const Rf = R(100000);

const invertingAmp = Circuit('Inverting Amplifier (5-pin)', [
  [VCC(15), op.vPos],
  [VNEG(-15), op.vNeg],
  [AC(0.1, 1000), Rin, op.inN],
  [op.inN, Rf, op.out],
  [op.inP, GND()],
]);
```

Notes

- Power rails are explicit: remember to connect `vPos`/`vNeg` to supplies for correct validation and summaries.
- The 3-pin variant is convenient for simplified circuits and examples where power rails are implicit or not modeled.
