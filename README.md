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
)
```

  Quick start
  -----------

  Install dependencies, build, run examples and tests:

  ```bash
  npm install
  npm run build
  npm run example
  npm run test
  ```

  Documentation
  -------------

  The canonical documentation lives in the `docs/` folder. Start at the HOME page:

  - [Home](docs/HOME.md) — consolidated home page with a feature table and links to detailed pages (components, API, examples).

  Examples & usage
  -----------------

  - See `playground.ts` and `core/examples.ts` for runnable examples (LED circuits, op-amp examples, logic gate samples, rectifiers).
  - Run `npm run example` to execute and print summaries for the included examples.

  Contributing
  ------------

  - Add new components under `core/components` and export them from `core/components/index.ts`.
  - Keep examples in `core/examples.ts` or add new example functions and register them in `run-examples.js`.

  Contact
  -------

  Project repository: https://github.com/ssevindik/wirelang

  For more details and the full API reference open: `docs/HOME.md`.
