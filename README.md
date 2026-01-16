# WireLang

A code-first domain-specific language (DSL) for describing electronic circuits.

This project focuses on:

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

## Documentation

The full documentation is available under the `docs/` folder. Start at the HOME page:

- `docs/HOME.md` — consolidated home page with links to component reference, API, and examples.
- `DOCUMENTATION.md` — (removed) single-file overview was deprecated; see `docs/HOME.md`.

For detailed usage and examples see `docs/HOME.md`.
