/**
 * DB <-> DSL IO Demo Test
 * Prints explicit input/output blocks for quick manual inspection.
 */

/// <reference types="node" />

import { describe, it, expect } from 'vitest';
import * as core from '../core';
import { Circuit, DC, GND, R } from '../core';
import { compileDslToDb, reverseDbToDsl, type WireLangDb } from '../core/db';

describe('DB <-> DSL IO Demo', () => {
  it('prints input/output for both directions', () => {
    const dslInput = Circuit('IO Test', DC(5), R(1000), GND());
    const dbOutput = compileDslToDb(dslInput);

    console.log('\n[DSL -> DB] INPUT DSL SUMMARY');
    console.log(dslInput.getSummary());
    console.log('[DSL -> DB] OUTPUT DB JSON');
    console.log(JSON.stringify(dbOutput, null, 2));

    const dbInput: WireLangDb = {
      schema: 'wirelang-db@v1',
      name: 'IO Test DB Input',
      components: dbOutput.components,
      nodes: dbOutput.nodes,
    };

    const dslOutput = reverseDbToDsl(dbInput, { moduleImport: '@wirelang/core', format: 'dsl' });

    console.log('\n[DB -> DSL] INPUT DB JSON');
    console.log(JSON.stringify(dbInput, null, 2));
    console.log('[DB -> DSL] OUTPUT DSL CODE');
    console.log(dslOutput);

    const runtimeScope: Record<string, unknown> = { ...core };
    const baseCircuit = core.Circuit;
    let rebuilt: ReturnType<typeof Circuit> | undefined;

    runtimeScope.Circuit = (...args: unknown[]) => {
      const schematic = baseCircuit(...(args as Parameters<typeof baseCircuit>));
      rebuilt = schematic;
      return schematic;
    };

    const names = Object.keys(runtimeScope);
    const values = names.map(name => runtimeScope[name]);
    const evaluator = new Function(...names, `${dslOutput}\nreturn 0;`);
    evaluator(...values);

    expect(rebuilt).toBeDefined();
    if (!rebuilt) {
      throw new Error('Expected Circuit(...) to be captured from plain DSL output');
    }
    const rebuiltDb = compileDslToDb(rebuilt);

    expect(rebuiltDb.components.length).toBe(dbInput.components.length);
    expect(rebuiltDb.nodes.length).toBeGreaterThan(0);
  });
});
