/**
 * Circuit and DSL Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Circuit, createCircuit } from '../core/Circuit';
import { Component } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  R, C, L,
  DC, GND,
  createLED,
  RED,
} from '../core/components';
import {
  Series,
  Parallel,
  wire,
  junction,
  applyToCircuit,
  buildCircuit,
} from '../core/dsl';
import { kOhm, uF } from '../core/units';

describe('Circuit', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should create empty circuit', () => {
    const circuit = createCircuit('test');
    expect(circuit.name).toBe('test');
    expect(circuit.components.length).toBe(0);
    expect(circuit.nodes.length).toBe(0);
  });

  it('should add components', () => {
    const circuit = createCircuit('test');
    const r1 = R(100);
    const r2 = R(200);
    
    circuit.addComponent(r1);
    circuit.addComponents(r2);
    
    expect(circuit.components.length).toBe(2);
  });

  it('should create and add nodes', () => {
    const circuit = createCircuit('test');
    const node = circuit.createNode('VCC');
    
    expect(circuit.nodes.length).toBe(1);
    expect(node.name).toBe('VCC');
  });

  it('should connect pins to nodes', () => {
    const circuit = createCircuit('test');
    const r = R(100);
    const node = circuit.createNode('net1');
    
    circuit.addComponent(r);
    circuit.connect(r.p1, node);
    
    expect(r.p1.isConnectedTo(node)).toBe(true);
  });

  it('should get ground node', () => {
    const circuit = createCircuit('test');
    const gnd = circuit.groundNode;
    
    expect(gnd.isGround()).toBe(true);
    expect(circuit.nodes).toContain(gnd);
  });

  it('should find unconnected pins', () => {
    const circuit = createCircuit('test');
    const r = R(100);
    circuit.addComponent(r);
    
    const unconnected = circuit.getUnconnectedPins();
    expect(unconnected.length).toBe(2);
  });

  it('should find pins at node', () => {
    const circuit = createCircuit('test');
    const r1 = R(100);
    const r2 = R(200);
    const node = circuit.createNode('net1');
    
    circuit.addComponents(r1, r2);
    circuit.connect(r1.p2, node);
    circuit.connect(r2.p1, node);
    
    const pins = circuit.getPinsAtNode(node);
    expect(pins.length).toBe(2);
  });

  it('should validate circuit', () => {
    const circuit = createCircuit('test');
    const r = R(100);
    circuit.addComponent(r);
    
    const result = circuit.validate();
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

  describe('buildCircuit', () => {
    it('should create complete circuit', () => {
      const circuit = buildCircuit('LED Circuit',
        DC(5),
        R(330),
        createLED(RED),
        GND()
      );
      
      expect(circuit.name).toBe('LED Circuit');
      expect(circuit.components.length).toBe(4);
    });
  });

  describe('Nested Series/Parallel', () => {
    it('should handle nested connections', () => {
      const circuit = createCircuit('Nested');
      
      const result = Series(
        DC(9),
        Parallel(
          R(kOhm(1)),
          R(kOhm(2))
        ),
        GND()
      );
      
      applyToCircuit(circuit, result);
      
      expect(circuit.components.length).toBe(4); // DC, R1, R2, GND
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
    const circuit = buildCircuit('Valid',
      DC(5),
      R(330),
      createLED(RED),
      GND()
    );
    
    const result = circuit.validate();
    // LED circuit should be mostly valid
    expect(result.errors.length).toBe(0);
  });

  it('should warn about missing ground', () => {
    const circuit = createCircuit('No Ground');
    circuit.addComponent(R(100));
    circuit.addComponent(DC(5));
    
    const result = circuit.validate();
    expect(result.warnings.some(w => w.includes('ground'))).toBe(true);
  });

  it('should report component validation errors', () => {
    const circuit = createCircuit('Invalid');
    circuit.addComponent(R(0)); // Zero resistance
    
    const result = circuit.validate();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
