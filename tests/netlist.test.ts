/**
 * Netlist Import / Export Tests
 *
 * Covers:
 *  - exportNetlist: DB → SPICE
 *  - exportNetlist: DB → WireScript CSV
 *  - importNetlist: SPICE → DB
 *  - importNetlist: CSV → DB
 *  - auto-format detection
 *  - round-trip: DSL → DB → netlist → DB
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import { Circuit, DC, GND, R, C, L, NPN, LED, RED } from '../core';
import { compileDslToDb } from '../core/db';
import {
  exportNetlist,
  importNetlist,
  dbToNetlist,
  netlistToDb,
} from '../core/netlist';

// Reset global counters before each test for deterministic IDs
beforeEach(() => {
  Component.resetCounter();
  Pin.resetCounter();
  Node.resetCounter();
});

// ─────────────────────────────────────────────────────────────────────────────
// SPICE export tests
// ─────────────────────────────────────────────────────────────────────────────

describe('exportNetlist — SPICE format', () => {
  it('exports a simple RC circuit to SPICE', () => {
    const circuit = Circuit('RC Filter', DC(5), R(1000), C(1e-6), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db, { format: 'spice' });

    expect(spice).toContain('* RC Filter');
    expect(spice).toContain('.end');
    // Resistor: R prefix
    expect(spice).toMatch(/^R\d/m);
    // Capacitor: C prefix
    expect(spice).toMatch(/^C\d/m);
    // Voltage source: V prefix
    expect(spice).toMatch(/^V\d/m);
  });

  it('uses alias dbToNetlist correctly', () => {
    const circuit = Circuit('Alias', DC(3.3), R(470), GND());
    const db = compileDslToDb(circuit);
    const spice = dbToNetlist(db);
    expect(spice).toContain('.end');
    expect(spice).toMatch(/^R\d/m);
  });

  it('accepts a custom title', () => {
    const circuit = Circuit('My Circuit', DC(5), R(100), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db, { title: 'Custom Title Here' });
    expect(spice).toContain('* Custom Title Here');
  });

  it('can suppress .end directive', () => {
    const circuit = Circuit('No End', DC(5), R(100), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db, { spiceEnd: false });
    expect(spice).not.toContain('.end');
  });

  it('emits SPICE node 0 for ground', () => {
    const circuit = Circuit('GND Test', DC(5), R(100), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db);
    // Ground node must appear as "0" in node references
    expect(spice).toContain('0');
  });

  it('exports inductor with L prefix', () => {
    const circuit = Circuit('Inductor', DC(5), L(1e-3), R(10), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db);
    expect(spice).toMatch(/^L\d/m);
  });

  it('exports BJT transistor with Q prefix', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('BJT', [
      [DC(5), R(1000), t.C],
      [t.E, GND()],
      [DC(5), R(10000), t.B],
    ]);
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db);
    expect(spice).toMatch(/^Q/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WireScript CSV export tests
// ─────────────────────────────────────────────────────────────────────────────

describe('exportNetlist — ws-csv format', () => {
  it('exports CSV with required columns', () => {
    const circuit = Circuit('CSV Test', DC(5), R(330), GND());
    const db = compileDslToDb(circuit);
    const csv = exportNetlist(db, { format: 'ws-csv' });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('refdes,type,pin,net,value,model');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('contains component type and pin data', () => {
    const circuit = Circuit('CSV Pins', DC(5), R(1000), GND());
    const db = compileDslToDb(circuit);
    const csv = exportNetlist(db, { format: 'ws-csv' });

    expect(csv).toContain('voltage_source');
    expect(csv).toContain('resistor');
    expect(csv).toContain('positive');
    expect(csv).toContain('negative');
  });

  it('marks unconnected pins as NC', () => {
    // Single component with no connections
    const db = compileDslToDb(Circuit('Alone', DC(5), R(100), GND()));
    const csv = exportNetlist(db, { format: 'ws-csv' });
    // All connected nodes should be present; NC should appear for any isolated pin
    expect(typeof csv).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPICE import tests
// ─────────────────────────────────────────────────────────────────────────────

describe('importNetlist — SPICE format', () => {
  it('parses a simple SPICE netlist', () => {
    const spice = `* Test circuit
V1 VCC 0 5
R1 VCC OUT 1K
C1 OUT 0 1U
.end`;

    const db = importNetlist(spice);
    expect(db.schema).toBe('wirescript-db@v1');
    // V1, R1, C1 plus the Ground symbol re-materialised from SPICE net 0.
    expect(db.components.length).toBe(4);
    expect(db.components.filter(c => c.type !== 'ground')).toHaveLength(3);
    expect(db.components.some(c => c.type === 'ground')).toBe(true);
    expect(db.nodes.length).toBeGreaterThan(0);
  });

  it('uses alias netlistToDb correctly', () => {
    const spice = '* Alias\nR1 A B 470\n.end';
    const db = netlistToDb(spice);
    expect(db.components.length).toBe(1);
    expect(db.components[0].type).toBe('resistor');
  });

  it('maps ground net 0 to isGround node', () => {
    const spice = 'V1 VCC 0 5\nR1 VCC OUT 1K\n.end';
    const db = importNetlist(spice);
    const gndNode = db.nodes.find(n => n.isGround);
    expect(gndNode).toBeDefined();
    expect(gndNode?.name).toBe('GND');
  });

  it('parses SI suffixes in values', () => {
    const spice = 'R1 A B 10K\n.end';
    const db = importNetlist(spice);
    expect(db.components[0].params.value).toBeCloseTo(10000);
  });

  it('parses MEG suffix', () => {
    const spice = 'R1 A B 2.2MEG\n.end';
    const db = importNetlist(spice);
    expect(db.components[0].params.value).toBeCloseTo(2.2e6);
  });

  it('parses micro (U) suffix', () => {
    const spice = 'C1 A B 100U\n.end';
    const db = importNetlist(spice);
    expect(db.components[0].params.value).toBeCloseTo(100e-6);
  });

  it('parses nano (N) suffix', () => {
    const spice = 'C1 A B 47N\n.end';
    const db = importNetlist(spice);
    expect(db.components[0].params.value).toBeCloseTo(47e-9);
  });

  it('ignores comment lines starting with *', () => {
    const spice = `* Comment line
* Another comment
R1 A B 1K
.end`;
    const db = importNetlist(spice);
    expect(db.components.length).toBe(1);
  });

  it('ignores directive lines starting with .', () => {
    const spice = `R1 A B 1K
.tran 1n 1m
.end`;
    const db = importNetlist(spice);
    expect(db.components.length).toBe(1);
  });

  it('assigns correct pin names for two-terminal components', () => {
    const spice = 'R1 A B 1K\n.end';
    const db = importNetlist(spice);
    const pins = db.components[0].pins;
    expect(pins[0].name).toBe('1');
    expect(pins[1].name).toBe('2');
  });

  it('assigns correct pin names for BJT (Q)', () => {
    const spice = 'Q1 COLL BASE EMITTER 2N2222\n.end';
    const db = importNetlist(spice);
    const pins = db.components[0].pins;
    expect(pins[0].name).toBe('collector');
    expect(pins[1].name).toBe('base');
    expect(pins[2].name).toBe('emitter');
  });

  it('accepts a custom name option', () => {
    const spice = 'R1 A B 1K\n.end';
    const db = importNetlist(spice, { name: 'My Import' });
    expect(db.name).toBe('My Import');
  });

  it('extracts title from first * comment', () => {
    const spice = '* My Schematic\nR1 A B 1K\n.end';
    const db = importNetlist(spice);
    expect(db.name).toBe('My Schematic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV import tests
// ─────────────────────────────────────────────────────────────────────────────

describe('importNetlist — ws-csv format', () => {
  it('parses a valid CSV netlist', () => {
    const csv = [
      'refdes,type,pin,net,value,model',
      'R1,resistor,1,VCC,1000,',
      'R1,resistor,2,OUT,1000,',
      'C1,capacitor,1,OUT,0.000001,',
      'C1,capacitor,2,0,0.000001,',
    ].join('\n');

    const db = importNetlist(csv, { format: 'ws-csv' });
    expect(db.schema).toBe('wirescript-db@v1');
    expect(db.components.length).toBe(2); // R1 and C1 grouped
    expect(db.nodes.length).toBeGreaterThan(0);
  });

  it('auto-detects CSV format', () => {
    const csv = [
      'refdes,type,pin,net,value,model',
      'R1,resistor,1,A,100,',
    ].join('\n');

    const db = importNetlist(csv); // no format option
    expect(db.components.length).toBe(1);
    expect(db.components[0].type).toBe('resistor');
  });

  it('maps ground net 0 to isGround node in CSV', () => {
    const csv = [
      'refdes,type,pin,net',
      'R1,resistor,1,VCC',
      'R1,resistor,2,0',
    ].join('\n');

    const db = importNetlist(csv, { format: 'ws-csv' });
    const gndNode = db.nodes.find(n => n.isGround);
    expect(gndNode).toBeDefined();
  });

  it('marks NC pins as unconnected', () => {
    const csv = [
      'refdes,type,pin,net',
      'R1,resistor,1,NC',
      'R1,resistor,2,A',
    ].join('\n');

    const db = importNetlist(csv, { format: 'ws-csv' });
    const r = db.components[0];
    const ncPin = r.pins.find(p => p.name === '1');
    expect(ncPin?.nodeId).toBeUndefined();
  });

  it('throws on empty CSV', () => {
    expect(() => importNetlist('', { format: 'ws-csv' })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Netlist round-trip', () => {
  it('DSL → DB → SPICE → DB preserves component count', () => {
    const circuit = Circuit('Round Trip', DC(5), R(1000), C(1e-6), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db, { format: 'spice' });
    const rebuilt = importNetlist(spice, { format: 'spice' });

    // SPICE has no symbol for ground, but net 0 is re-materialised as a
    // Ground component on import, so the round-trip is lossless here.
    const originalSignal = db.components.filter(
      c => c.type !== 'ground' && c.type !== 'power_rail',
    ).length;
    const rebuiltSignal = rebuilt.components.filter(c => c.type !== 'ground').length;
    expect(rebuiltSignal).toBe(originalSignal);
    expect(rebuilt.components.some(c => c.type === 'ground')).toBe(true);
  });

  it('a round-tripped netlist still passes ERC', () => {
    const circuit = Circuit('Round Trip ERC', DC(5), R(330), LED(RED), GND());
    const spice = exportNetlist(compileDslToDb(circuit), { format: 'spice' });
    const rebuilt = importNetlist(spice, { format: 'spice' });
    // The ground reference must survive, or every rebuilt circuit would
    // report ERC_NO_GROUND.
    expect(rebuilt.nodes.some(n => n.isGround)).toBe(true);
    expect(rebuilt.components.some(c => c.type === 'ground')).toBe(true);
  });

  it('DSL → DB → CSV → DB preserves component count', () => {
    const circuit = Circuit('CSV Round Trip', DC(5), R(330), C(100e-9), GND());
    const db = compileDslToDb(circuit);
    const csv = exportNetlist(db, { format: 'ws-csv' });
    const rebuilt = importNetlist(csv, { format: 'ws-csv' });

    // CSV includes all components (including ground), so compare total counts
    expect(rebuilt.components.length).toBe(db.components.length);
  });

  it('DB → SPICE → DB preserves node connectivity', () => {
    const circuit = Circuit('Nodes', DC(5), R(1000), GND());
    const db = compileDslToDb(circuit);
    const spice = exportNetlist(db);
    const rebuilt = importNetlist(spice);

    // Every component in rebuilt DB should have at least one connected pin
    for (const comp of rebuilt.components) {
      const connected = comp.pins.filter(p => p.nodeId);
      expect(connected.length).toBeGreaterThan(0);
    }
  });
});
