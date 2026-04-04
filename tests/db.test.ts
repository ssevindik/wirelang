/**
 * DB Transform Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '../core';
import { Component } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import { createSchematic } from '../core/Schematic';
import { DC, GND, R } from '../core/components';
import { Series, applyToCircuit } from '../core/dsl';
import {
  compileDslToDb,
  reverseDbToDsl,
  dsl2db,
  db2dsl,
} from '../core/db';
import { applyComponentIdentity, applyNodeIdentity } from '../core/identity';

describe('DB Transforms', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should compile schematic to db', () => {
    const s = createSchematic('Simple');
    const result = Series(DC(5), R(1000), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);

    expect(db.schema).toBe('wirelang-db@v1');
    expect(db.name).toBe('Simple');
    expect(db.components.length).toBe(3);
    expect(db.nodes.length).toBeGreaterThan(0);

    const nodeIds = new Set(db.nodes.map(node => node.id));
    const pins = db.components.flatMap(component => component.pins);
    const connectedPins = pins.filter(pin => pin.nodeId);

    expect(connectedPins.length).toBeGreaterThan(0);
    for (const pin of connectedPins) {
      expect(nodeIds.has(pin.nodeId!)).toBe(true);
    }
  });

  it('should expose alias functions', () => {
    const s = createSchematic('Alias');
    const result = Series(DC(3.3), R(220), GND());
    applyToCircuit(s, result);

    const db = dsl2db(s);
    const dsl = db2dsl(db);

    expect(db.schema).toBe('wirelang-db@v1');
    expect(dsl).not.toContain('module.exports');
    expect(dsl).not.toContain('require(');
    expect(dsl).not.toContain('const ');
    expect(dsl).not.toContain('import ');
    expect(dsl).toContain('Circuit(');
    expect(dsl).toContain('.p');
    expect(dsl).toContain('.p1');
    expect(dsl).toContain('.p2');
  });

  it('should emit reverse DSL in plain mode by default', () => {
    const s = createSchematic('Reverse');
    const result = Series(DC(9), R(470), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { moduleImport: '../core' });

    expect(dsl).toContain('Circuit(');
    expect(dsl).toContain('"Reverse"');
    expect(dsl).not.toContain('module.exports');
    expect(dsl).not.toContain('require(');
    expect(dsl).not.toContain('const ');
    expect(dsl).not.toContain('import ');
    expect(dsl).toContain('.p');
    expect(dsl).toContain('.p1');
    expect(dsl).toContain('R(');
    expect(dsl).toContain('DC(');
    expect(dsl).toContain('GND(');
  });

  it('should allow suppressing identity helpers', () => {
    const s = createSchematic('NoIds');
    const result = Series(DC(1.8), R(330), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { format: 'ts', preserveIds: false });

    expect(dsl).not.toContain('applyComponentIdentity');
    expect(dsl).not.toContain('applyNodeIdentity');
  });

  it('should match snapshot for default db2dsl output', () => {
    const s = createSchematic('Snapshot');
    const result = Series(DC(5), R(1000), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { moduleImport: '../core' });

    expect(dsl).toMatchSnapshot();
  });

  it('should match snapshot for ts db2dsl output', () => {
    const s = createSchematic('Snapshot');
    const result = Series(DC(5), R(1000), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { format: 'ts', moduleImport: '../core' });

    expect(dsl).toMatchSnapshot();
  });

  it('should generate plain DSL that can be executed and recompiled', () => {
    const s = createSchematic('RoundTrip');
    const result = Series(DC(5), R(330), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { moduleImport: '@wirelang/core' });

    const runtimeScope: Record<string, unknown> = { ...core };
    const baseCircuit = core.Circuit;
    let rebuilt: ReturnType<typeof createSchematic> | undefined;

    runtimeScope.Circuit = (...args: unknown[]) => {
      const schematic = baseCircuit(...(args as Parameters<typeof baseCircuit>));
      rebuilt = schematic;
      return schematic;
    };

    const names = Object.keys(runtimeScope);
    const values = names.map(name => runtimeScope[name]);
    const evaluator = new Function(...names, `${dsl}\nreturn 0;`);
    evaluator(...values);

    expect(rebuilt).toBeDefined();
    if (!rebuilt) {
      throw new Error('Expected Circuit(...) to be captured from plain DSL output');
    }
    const rebuiltDb = compileDslToDb(rebuilt);

    expect(rebuiltDb.name).toBe(db.name);
    expect(rebuiltDb.components.length).toBe(db.components.length);
    const connectedPins = rebuiltDb.components.flatMap(component => component.pins).filter(pin => pin.nodeId);
    expect(connectedPins.length).toBeGreaterThan(0);
  });
});

describe('Identity Helpers', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should apply component and pin identities', () => {
    const r = R(100);

    applyComponentIdentity(r, {
      id: 'component_custom',
      label: 'R99',
      pinIds: { '1': 'pin_custom_1', '2': 'pin_custom_2' },
    });

    expect(r.id).toBe('component_custom');
    expect(r.label).toBe('R99');
    expect(r.p1.id).toBe('pin_custom_1');
    expect(r.p2.id).toBe('pin_custom_2');
  });

  it('should apply node identity', () => {
    const node = new Node('NET');
    applyNodeIdentity(node, 'node_custom');
    expect(node.id).toBe('node_custom');
  });
});
