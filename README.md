# WireLang

A code-first domain-specific language (DSL) for describing electronic circuits.

This project focuses on:
- Readable circuit definitions
- Clear connectivity semantics
- Separation of circuit logic from UI and simulation

## Status
⚠️ Early experimental stage.

Core graph model and DSL runtime are under active development.
No simulation or PCB support yet.

## Example

```ts
mcu = MCU("ATmega8")

circuit = Series(
  DC(5),
  mcu.PB5,
  LED(RED),
  Resistor(330),
  GND()
)
