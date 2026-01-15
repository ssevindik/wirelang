/**
 * Transistor Tests - BJT and MOSFET
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  NPN, PNP, NPNTransistor, PNPTransistor,
  NMOS, PMOS, NMOSTransistor, PMOSTransistor,
} from '../core/components';

describe('BJT Transistors', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  describe('NPN', () => {
    it('should create NPN with default model', () => {
      const t = NPN();
      expect(t).toBeInstanceOf(NPNTransistor);
      expect(t.model).toBe('generic');
      expect(t.hfe).toBe(100);
    });

    it('should create NPN with specific model', () => {
      const t = NPN('2N2222');
      expect(t.model).toBe('2N2222');
      expect(t.hfe).toBe(100);
      expect(t.vbe).toBe(0.7);
    });

    it('should create NPN with custom params', () => {
      const t = NPN({ model: '2N3904', hfe: 200 });
      expect(t.model).toBe('2N3904');
      expect(t.hfe).toBe(200);
    });

    it('should have B, C, E pins', () => {
      const t = NPN();
      expect(t.B).toBeDefined();
      expect(t.C).toBeDefined();
      expect(t.E).toBeDefined();
      expect(t.B.name).toBe('B');
      expect(t.C.name).toBe('C');
      expect(t.E.name).toBe('E');
    });

    it('should have 3 pins', () => {
      const t = NPN();
      expect(t.pins.length).toBe(3);
    });

    it('should validate correctly', () => {
      const t = NPN();
      const errors = t.validate();
      expect(errors.length).toBe(0);
    });

    it('should have correct toString', () => {
      const t = NPN('2N2222');
      expect(t.toString()).toBe('NPN(2N2222, hfe=100)');
    });
  });

  describe('PNP', () => {
    it('should create PNP with default model', () => {
      const t = PNP();
      expect(t).toBeInstanceOf(PNPTransistor);
      expect(t.model).toBe('generic');
    });

    it('should create PNP with specific model', () => {
      const t = PNP('2N2907');
      expect(t.model).toBe('2N2907');
      expect(t.hfe).toBe(100);
    });

    it('should have B, C, E pins', () => {
      const t = PNP();
      expect(t.B).toBeDefined();
      expect(t.C).toBeDefined();
      expect(t.E).toBeDefined();
    });
  });
});

describe('MOSFET Transistors', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  describe('NMOS', () => {
    it('should create NMOS with default model', () => {
      const m = NMOS();
      expect(m).toBeInstanceOf(NMOSTransistor);
      expect(m.model).toBe('generic');
      expect(m.vth).toBe(2.0);
    });

    it('should create NMOS with specific model', () => {
      const m = NMOS('2N7000');
      expect(m.model).toBe('2N7000');
      expect(m.vth).toBe(2.1);
      expect(m.rds_on).toBe(5);
    });

    it('should create NMOS with custom params', () => {
      const m = NMOS({ model: 'IRF540', vth: 3.5 });
      expect(m.model).toBe('IRF540');
      expect(m.vth).toBe(3.5);
    });

    it('should have G, D, S pins', () => {
      const m = NMOS();
      expect(m.G).toBeDefined();
      expect(m.D).toBeDefined();
      expect(m.S).toBeDefined();
      expect(m.G.name).toBe('G');
      expect(m.D.name).toBe('D');
      expect(m.S.name).toBe('S');
    });

    it('should have 3 pins', () => {
      const m = NMOS();
      expect(m.pins.length).toBe(3);
    });

    it('should validate correctly', () => {
      const m = NMOS();
      const errors = m.validate();
      expect(errors.length).toBe(0);
    });

    it('should have correct toString', () => {
      const m = NMOS('2N7000');
      expect(m.toString()).toBe('NMOS(2N7000, Vth=2.1V)');
    });
  });

  describe('PMOS', () => {
    it('should create PMOS with default model', () => {
      const m = PMOS();
      expect(m).toBeInstanceOf(PMOSTransistor);
      expect(m.model).toBe('generic');
    });

    it('should create PMOS with specific model', () => {
      const m = PMOS('IRF9540');
      expect(m.model).toBe('IRF9540');
      expect(m.vth).toBe(-4.0);  // P-channel has negative Vth
    });

    it('should have G, D, S pins', () => {
      const m = PMOS();
      expect(m.G).toBeDefined();
      expect(m.D).toBeDefined();
      expect(m.S).toBeDefined();
    });
  });
});

describe('Transistor Pin Connections', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should connect BJT pins to nodes', () => {
    const t = NPN('2N2222');
    const baseNode = new Node('base_bias');
    const collectorNode = new Node('collector');
    const emitterNode = new Node('emitter');

    t.B.connectTo(baseNode);
    t.C.connectTo(collectorNode);
    t.E.connectTo(emitterNode);

    expect(t.B.isConnectedTo(baseNode)).toBe(true);
    expect(t.C.isConnectedTo(collectorNode)).toBe(true);
    expect(t.E.isConnectedTo(emitterNode)).toBe(true);
  });

  it('should connect MOSFET pins to nodes', () => {
    const m = NMOS('2N7000');
    const gateNode = new Node('gate');
    const drainNode = new Node('drain');
    const sourceNode = new Node('source');

    m.G.connectTo(gateNode);
    m.D.connectTo(drainNode);
    m.S.connectTo(sourceNode);

    expect(m.G.isConnectedTo(gateNode)).toBe(true);
    expect(m.D.isConnectedTo(drainNode)).toBe(true);
    expect(m.S.isConnectedTo(sourceNode)).toBe(true);
  });
});
