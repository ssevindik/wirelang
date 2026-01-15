/**
 * Schematic and DSL Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Schematic, createSchematic } from '../core/Schematic';
import { Component } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  R, C, L,
  DC, GND,
  createLED,
  RED,
  NPN,
} from '../core/components';
import {
  Series,
  Parallel,
  wire,
  junction,
  applyToCircuit,
  Circuit,
} from '../core/dsl';
import { kOhm, uF } from '../core/units';

describe('Schematic', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should create empty schematic', () => {
    const s = createSchematic('test');
    expect(s.name).toBe('test');
    expect(s.components.length).toBe(0);
    expect(s.nodes.length).toBe(0);
  });

  it('should add components', () => {
    const s = createSchematic('test');
    const r1 = R(100);
    const r2 = R(200);
    
    s.addComponent(r1);
    s.addComponents(r2);
    
    expect(s.components.length).toBe(2);
  });

  it('should create and add nodes', () => {
    const s = createSchematic('test');
    const node = s.createNode('VCC');
    
    expect(s.nodes.length).toBe(1);
    expect(node.name).toBe('VCC');
  });

  it('should connect pins to nodes', () => {
    const s = createSchematic('test');
    const r = R(100);
    const node = s.createNode('net1');
    
    s.addComponent(r);
    s.connect(r.p1, node);
    
    expect(r.p1.isConnectedTo(node)).toBe(true);
  });

  it('should get ground node', () => {
    const s = createSchematic('test');
    const gnd = s.groundNode;
    
    expect(gnd.isGround()).toBe(true);
    expect(s.nodes).toContain(gnd);
  });

  it('should find unconnected pins', () => {
    const s = createSchematic('test');
    const r = R(100);
    s.addComponent(r);
    
    const unconnected = s.getUnconnectedPins();
    expect(unconnected.length).toBe(2);
  });

  it('should find pins at node', () => {
    const s = createSchematic('test');
    const r1 = R(100);
    const r2 = R(200);
    const node = s.createNode('net1');
    
    s.addComponents(r1, r2);
    s.connect(r1.p2, node);
    s.connect(r2.p1, node);
    
    const pins = s.getPinsAtNode(node);
    expect(pins.length).toBe(2);
  });

  it('should validate circuit', () => {
    const s = createSchematic('test');
    const r = R(100);
    s.addComponent(r);
    
    const result = s.validate();
    expect(result.warnings.length).toBeGreaterThan(0); // Unconnected pins
  });
});

describe('DSL Functions', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  describe('Series', () => {
    it('should connect components in series', () => {
      const r1 = R(100);
      const r2 = R(200);
      const r3 = R(300);
      
      const result = Series(r1, r2, r3);
      
      expect(result.components.length).toBe(3);
      expect(result.nodes.length).toBe(2); // 2 internal nodes
      
      // r1.p2 and r2.p1 should share a node
      expect(r1.p2.node).toBe(r2.p1.node);
      // r2.p2 and r3.p1 should share a node
      expect(r2.p2.node).toBe(r3.p1.node);
    });

    it('should expose first and last pins', () => {
      const r1 = R(100);
      const r2 = R(200);
      
      const result = Series(r1, r2);
      
      expect(result.firstPin).toBe(r1.p1);
      expect(result.lastPin).toBe(r2.p2);
    });
  });

  describe('Parallel', () => {
    it('should connect components in parallel', () => {
      const r1 = R(100);
      const r2 = R(200);
      const r3 = R(300);
      
      const result = Parallel(r1, r2, r3);
      
      // All first pins share a node
      expect(r1.p1.node).toBe(r2.p1.node);
      expect(r2.p1.node).toBe(r3.p1.node);
      
      // All second pins share a node
      expect(r1.p2.node).toBe(r2.p2.node);
      expect(r2.p2.node).toBe(r3.p2.node);
    });
  });

  describe('wire', () => {
    it('should connect two pins', () => {
      const r1 = R(100);
      const r2 = R(200);
      
      const node = wire(r1.p2, r2.p1);
      
      expect(r1.p2.node).toBe(node);
      expect(r2.p1.node).toBe(node);
    });
  });

  describe('junction', () => {
    it('should connect multiple pins', () => {
      const r1 = R(100);
      const r2 = R(200);
      const r3 = R(300);
      
      const node = junction(r1.p2, r2.p1, r3.p1);
      
      expect(r1.p2.node).toBe(node);
      expect(r2.p1.node).toBe(node);
      expect(r3.p1.node).toBe(node);
    });
  });

  describe('Circuit', () => {
    it('should create complete circuit', () => {
      const c = Circuit('LED Circuit',
        DC(5),
        R(330),
        createLED(RED),
        GND()
      );
      
      expect(c.name).toBe('LED Circuit');
      expect(c.components.length).toBe(4);
    });
  });

  describe('Nested Series/Parallel', () => {
    it('should handle nested connections', () => {
      const s = createSchematic('Nested');
      
      const result = Series(
        DC(9),
        Parallel(
          R(kOhm(1)),
          R(kOhm(2))
        ),
        GND()
      );
      
      applyToCircuit(s, result);
      
      expect(s.components.length).toBe(4); // DC, R1, R2, GND
    });
  });

  describe('Array-based Circuit', () => {
    it('should create circuit with multiple paths', () => {
      const c = Circuit('Multi-path', [
        [DC(5), R(100), GND()],
        [DC(12), R(200), GND()],
      ]);
      
      expect(c.components.length).toBe(6); // 2x DC, 2x R, 2x GND
    });

    it('should connect transistor pins correctly', () => {
      const t = NPN('2N2222');
      
      const c = Circuit('NPN Switch', [
        [DC(5), R(330), t.C],   // Collector path
        [t.E, GND()],           // Emitter path
        [DC(5), R(kOhm(10)), t.B], // Base bias
      ]);
      
      // 3 paths with transistor pins included
      // DC, R, LED, NPN(from t.C), GND(from t.E), DC, R, NPN(from t.B) = 6 unique
      expect(c.components.length).toBe(6); // DC, R, LED, NPN, GND, DC, R
      
      // Verify transistor pins are connected
      expect(t.C.isConnected()).toBe(true);
      expect(t.E.isConnected()).toBe(true);
      expect(t.B.isConnected()).toBe(true);
    });
  });
});

describe('Circuit Validation', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should validate complete circuit', () => {
    const c = Circuit('Valid',
      DC(5),
      R(330),
      createLED(RED),
      GND()
    );
    
    const result = c.validate();
    // LED circuit should be mostly valid
    expect(result.errors.length).toBe(0);
  });

  it('should warn about missing ground', () => {
    const s = createSchematic('No Ground');
    s.addComponent(R(100));
    s.addComponent(DC(5));
    
    const result = s.validate();
    expect(result.warnings.some(w => w.includes('ground'))).toBe(true);
  });

  it('should report component validation errors', () => {
    const s = createSchematic('Invalid');
    s.addComponent(R(0)); // Zero resistance
    
    const result = s.validate();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
