/**
 * Pin and Node Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Pin } from '../core/Pin';
import { Node, createGroundNode } from '../core/Node';
import { PinDirection } from '../core/types';

describe('Node', () => {
  beforeEach(() => {
    Node.resetCounter();
  });

  it('should create a node with auto-generated id', () => {
    const node = new Node();
    expect(node.id).toBe('node_1');
  });

  it('should create a node with a name', () => {
    const node = new Node('VCC');
    expect(node.name).toBe('VCC');
    expect(node.toString()).toBe('Node(VCC)');
  });

  it('should identify ground nodes', () => {
    const gnd = new Node('GND');
    const vcc = new Node('VCC');
    
    expect(gnd.isGround()).toBe(true);
    expect(vcc.isGround()).toBe(false);
  });

  it('should create ground node via helper', () => {
    const gnd = createGroundNode();
    expect(gnd.isGround()).toBe(true);
    expect(gnd.name).toBe('GND');
  });
});

describe('Pin', () => {
  beforeEach(() => {
    Pin.resetCounter();
    Node.resetCounter();
  });

  it('should create a pin with name', () => {
    const pin = new Pin('anode');
    expect(pin.name).toBe('anode');
    expect(pin.id).toBe('pin_1');
  });

  it('should create a pin with direction', () => {
    const pin = new Pin('input', PinDirection.Input);
    expect(pin.direction).toBe(PinDirection.Input);
  });

  it('should start unconnected', () => {
    const pin = new Pin('test');
    expect(pin.isConnected()).toBe(false);
    expect(pin.node).toBeNull();
  });

  it('should connect to a node', () => {
    const pin = new Pin('test');
    const node = new Node('net1');
    
    pin.connectTo(node);
    
    expect(pin.isConnected()).toBe(true);
    expect(pin.node).toBe(node);
    expect(pin.isConnectedTo(node)).toBe(true);
  });

  it('should disconnect from a node', () => {
    const pin = new Pin('test');
    const node = new Node('net1');
    
    pin.connectTo(node);
    pin.disconnect();
    
    expect(pin.isConnected()).toBe(false);
    expect(pin.node).toBeNull();
  });
});
