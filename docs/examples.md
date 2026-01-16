# Examples

This page documents the example circuits included in `core/examples.ts` and how to run them.

## Example List (from `core/examples.ts`)

- `simpleLedCircuit()` — DC source -> resistor -> LED -> ground.
- `voltageDivider()` — two resistors in series forming a divider.
- `parallelResistors()` — multiple resistors in parallel.
- `rcLowPassFilter()` — resistor + capacitor low-pass filter.
- `lcTankCircuit()` — inductor + capacitor resonant tank.
- `trafficLight()` — multiple LEDs arranged as a traffic light.
- `fullWaveRectifier()` — bridge rectifier using 4 diodes with filter capacitor and load.

## Running Examples

Run the provided script to execute and print summaries of the examples:

```bash
npm run example
```

The script `run-examples.js` calls `core/examples.ts` functions and prints `getSummary()` and `validate()` results for each example.

## Notes on complex topologies

Some examples (like the bridge rectifier) show manual node creation and explicit `s.connect(pinA, pinB)` usage. These patterns are useful when `Series` and `Parallel` helpers are insufficient to express the desired wiring.
