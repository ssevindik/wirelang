/**
 * Unit System Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ohm, kOhm, MOhm,
  F, mF, uF, nF, pF,
  H, mH, uH,
  V, mV, kV,
  A, mA, uA,
  Hz, kHz, MHz, GHz,
  formatWithUnit,
  parseWithUnit,
} from '../core/units';

describe('Unit Multipliers', () => {
  describe('Resistance', () => {
    it('should convert ohms correctly', () => {
      expect(ohm(100)).toBe(100);
      expect(kOhm(1)).toBe(1000);
      expect(kOhm(4.7)).toBe(4700);
      expect(MOhm(1)).toBe(1_000_000);
    });
  });

  describe('Capacitance', () => {
    it('should convert farads correctly', () => {
      expect(F(1)).toBe(1);
      expect(mF(1)).toBe(0.001);
      expect(uF(100)).toBeCloseTo(0.0001);
      expect(nF(100)).toBeCloseTo(1e-7);
      expect(pF(100)).toBeCloseTo(1e-10);
    });
  });

  describe('Inductance', () => {
    it('should convert henrys correctly', () => {
      expect(H(1)).toBe(1);
      expect(mH(10)).toBe(0.01);
      expect(uH(100)).toBeCloseTo(0.0001);
    });
  });

  describe('Voltage', () => {
    it('should convert volts correctly', () => {
      expect(V(5)).toBe(5);
      expect(mV(100)).toBe(0.1);
      expect(kV(1)).toBe(1000);
    });
  });

  describe('Current', () => {
    it('should convert amperes correctly', () => {
      expect(A(1)).toBe(1);
      expect(mA(20)).toBe(0.02);
      expect(uA(100)).toBeCloseTo(0.0001);
    });
  });

  describe('Frequency', () => {
    it('should convert hertz correctly', () => {
      expect(Hz(60)).toBe(60);
      expect(kHz(1)).toBe(1000);
      expect(MHz(2.4)).toBe(2_400_000);
      expect(GHz(1)).toBe(1_000_000_000);
    });
  });
});

describe('formatWithUnit', () => {
  it('should format values with appropriate SI prefix', () => {
    expect(formatWithUnit(1000, 'Ω')).toBe('1kΩ');
    expect(formatWithUnit(0.001, 'F')).toBe('1mF');
    expect(formatWithUnit(0.000001, 'F')).toBe('1µF');
    expect(formatWithUnit(1000000, 'Hz')).toBe('1MHz');
  });
});

describe('parseWithUnit', () => {
  it('should parse value strings with SI prefix', () => {
    const result1 = parseWithUnit('10kohm');
    expect(result1.value).toBe(10000);
    expect(result1.unit).toBe('ohm');
    
    const result2 = parseWithUnit('100uF');
    expect(result2.value).toBeCloseTo(0.0001);
    expect(result2.unit).toBe('F');
    
    const result3 = parseWithUnit('2.4GHz');
    expect(result3.value).toBe(2_400_000_000);
    expect(result3.unit).toBe('Hz');
  });
});
