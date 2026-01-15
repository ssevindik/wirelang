/**
 * Component Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  Resistor, R,
  Capacitor, C,
  Inductor, L,
  Diode, D,
  LED, createLED,
  VoltageSource, DC, AC,
  CurrentSource, I_DC,
  Ground, GND,
  RED, GREEN, BLUE,
} from '../core/components';
import { kOhm, uF, mH, mA } from '../core/units';
import { ComponentType, SourceType } from '../core/types';

describe('Resistor', () => {
  beforeEach(() => {
    Component.resetCounter();
    Pin.resetCounter();
  });

  it('should create resistor with value', () => {
    const r = new Resistor(330);
    expect(r.resistance).toBe(330);
    expect(r.type).toBe(ComponentType.Resistor);
    expect(r.params.unit).toBe('Ω');
  });

  it('should create resistor with factory function', () => {
    const r = R(kOhm(4.7));
    expect(r.resistance).toBe(4700);
  });

  it('should have two pins', () => {
    const r = R(100);
    expect(r.pins.length).toBe(2);
    expect(r.p1).toBeDefined();
    expect(r.p2).toBeDefined();
  });

  it('should validate non-zero resistance', () => {
    const r = R(0);
    const errors = r.validate();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should format toString correctly', () => {
    const r = R(kOhm(10));
    expect(r.toString()).toBe('Resistor(10kΩ)');
  });
});

describe('Capacitor', () => {
  it('should create capacitor with value', () => {
    const c = C(uF(100));
    expect(c.capacitance).toBeCloseTo(0.0001);
    expect(c.type).toBe(ComponentType.Capacitor);
  });
});

describe('Inductor', () => {
  it('should create inductor with value', () => {
    const l = L(mH(10));
    expect(l.inductance).toBe(0.01);
    expect(l.type).toBe(ComponentType.Inductor);
  });
});

describe('Diode', () => {
  it('should create diode with default forward voltage', () => {
    const d = D();
    expect(d.forwardVoltage).toBe(0.7);
    expect(d.type).toBe(ComponentType.Diode);
  });

  it('should create diode with part number', () => {
    const d = D('1N4148');
    expect(d.partNumber).toBe('1N4148');
  });

  it('should have anode and cathode pins', () => {
    const d = D();
    expect(d.anode).toBeDefined();
    expect(d.cathode).toBeDefined();
  });
});

describe('LED', () => {
  it('should create LED with color', () => {
    const led = createLED(RED);
    expect(led.color).toBe(RED);
    expect(led.type).toBe(ComponentType.LED);
  });

  it('should have correct forward voltage for color', () => {
    const red = createLED(RED);
    const blue = createLED(BLUE);
    
    expect(red.forwardVoltage).toBe(1.8);
    expect(blue.forwardVoltage).toBe(3.2);
  });

  it('should have default max current of 20mA', () => {
    const led = createLED(GREEN);
    expect(led.maxCurrent).toBe(0.02);
  });
});

describe('VoltageSource', () => {
  it('should create DC source', () => {
    const dc = DC(5);
    expect(dc.voltage).toBe(5);
    expect(dc.sourceType).toBe(SourceType.DC);
  });

  it('should create AC source with frequency', () => {
    const ac = AC(12, 60);
    expect(ac.voltage).toBe(12);
    expect(ac.sourceType).toBe(SourceType.AC);
    expect(ac.frequency).toBe(60);
  });

  it('should have positive and negative pins', () => {
    const dc = DC(9);
    expect(dc.positive).toBeDefined();
    expect(dc.negative).toBeDefined();
  });
});

describe('CurrentSource', () => {
  it('should create DC current source', () => {
    const i = I_DC(mA(10));
    expect(i.current).toBe(0.01);
    expect(i.sourceType).toBe(SourceType.DC);
  });
});

describe('Ground', () => {
  it('should create ground component', () => {
    const gnd = GND();
    expect(gnd.type).toBe(ComponentType.Ground);
  });

  it('should have single pin', () => {
    const gnd = GND();
    expect(gnd.pins.length).toBe(1);
    expect(gnd.pin).toBeDefined();
  });

  it('should create ground node', () => {
    const gnd = GND();
    const node = gnd.getGroundNode();
    expect(node.isGround()).toBe(true);
  });
});
