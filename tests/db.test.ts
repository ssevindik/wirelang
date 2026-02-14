/**
 * DB Transform Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
    expect(dsl).toContain('createSchematic');
  });

  it('should emit reverse DSL with connections', () => {
    const s = createSchematic('Reverse');
    const result = Series(DC(9), R(470), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { moduleImport: '../core' });

    expect(dsl).toContain('createSchematic("Reverse")');
    expect(dsl).toContain('s.connect');
    expect(dsl).toContain('R(');
    expect(dsl).toContain('DC(');
    expect(dsl).toContain('GND(');
  });

  it('should allow suppressing identity helpers', () => {
    const s = createSchematic('NoIds');
    const result = Series(DC(1.8), R(330), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { preserveIds: false });

    expect(dsl).not.toContain('applyComponentIdentity');
    expect(dsl).not.toContain('applyNodeIdentity');
  });

  it('should match snapshot for db2dsl output', () => {
    const s = createSchematic('Snapshot');
    const result = Series(DC(5), R(1000), GND());
    applyToCircuit(s, result);

    const db = compileDslToDb(s);
    const dsl = reverseDbToDsl(db, { moduleImport: '../core' });

    expect(dsl).toMatchSnapshot();
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
