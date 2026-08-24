#!/usr/bin/env node
/**
 * Run ERC over every circuit in core/examples.ts, at the strictest preset.
 *
 * The library ships these as the worked examples people copy from, so they must
 * pass the checker the library ships — and pass it at `strict`, where every
 * rule that indicates a real defect reports an error. Exits 1 if any does not.
 *
 * Usage: node scripts/erc-examples.js [--preset strict|balanced|relaxed]
 */

const path = require('node:path');

const wirescript = require(path.join(__dirname, '..', 'dist', 'index.js'));
const examples = require(path.join(__dirname, '..', 'dist', 'examples.js'));

const presetFlag = process.argv.indexOf('--preset');
const preset = presetFlag !== -1 ? process.argv[presetFlag + 1] : 'strict';

let failures = 0;
let checked = 0;

console.log(`ERC over the example circuits — preset: ${preset}\n`);

/** Exports that run demos rather than returning a circuit. */
const NOT_A_CIRCUIT = /^run|^print|^demo/i;

for (const [name, factory] of Object.entries(examples)) {
  if (typeof factory !== 'function') continue;
  if (NOT_A_CIRCUIT.test(name)) continue;

  let schematic;
  try {
    schematic = factory();
  } catch {
    continue; // not a circuit factory
  }
  if (!schematic || typeof schematic.erc !== 'function') continue;

  checked += 1;
  const result = wirescript.runERC(schematic, { preset });
  const { error, warning, info } = result.counts;
  const mark = error > 0 ? 'FAIL' : 'ok  ';
  console.log(`${mark}  ${name.padEnd(26)} ${error} error(s), ${warning} warning(s), ${info} info(s)`);

  if (error > 0) {
    failures += 1;
    for (const violation of result.errors) {
      console.log(`        [${violation.ruleId}] ${violation.message}`);
      if (violation.hint) console.log(`            -> ${violation.hint}`);
    }
  }
}

console.log('');
if (checked === 0) {
  console.error('No example circuits found — did the build run?');
  process.exit(1);
}
if (failures > 0) {
  console.error(`${failures} of ${checked} example circuit(s) failed ERC.`);
  process.exit(1);
}
console.log(`All ${checked} example circuits pass ERC at --preset ${preset}.`);
