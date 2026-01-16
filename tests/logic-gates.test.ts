import { describe, it, expect, beforeEach } from 'vitest';
import {
  NOT, AND, OR, XOR, NAND, NOR,
  HIGH, LOW, CLK,
  Schematic, LED, RED, GREEN, BLUE,
  resetCounters,
  Circuit
} from '../core';

describe('Logic Gates', () => {
  // Reset counters before each test to get predictable labels
  beforeEach(() => {
    resetCounters();
  });

  describe('NOT Gate', () => {
    it('should create NOT gate with 2 pins', () => {
      const not = NOT();
      expect(not.pins.length).toBe(2);
      expect(not.pin('A')).toBeDefined();
      expect(not.pin('Y')).toBeDefined();
    });

    it('should have correct gate type and family', () => {
      const not = NOT();
      expect(not.gateType).toBe('NOT');
      expect(not.family).toBe('74HC');
    });

    it('should support custom family', () => {
      const not = NOT('74LS');
      expect(not.family).toBe('74LS');
    });

    it('should auto-label correctly', () => {
      const not1 = NOT();
      const not2 = NOT();
      expect(not1.label).toBe('NOT1');
      expect(not2.label).toBe('NOT2');
    });

    it('should have correct toString', () => {
      const not = NOT('CD4000');
      expect(not.toString()).toBe('NOT(CD4000)');
    });
  });

  describe('Two Input Gates', () => {
    it('should create AND gate with 3 pins', () => {
      const and = AND();
      expect(and.pins.length).toBe(3);
      expect(and.pin('A')).toBeDefined();
      expect(and.pin('B')).toBeDefined();
      expect(and.pin('Y')).toBeDefined();
    });

    it('should create OR gate', () => {
      const or = OR();
      expect(or.gateType).toBe('OR');
      expect(or.pins.length).toBe(3);
    });

    it('should create XOR gate', () => {
      const xor = XOR();
      expect(xor.gateType).toBe('XOR');
      expect(xor.pins.length).toBe(3);
    });

    it('should create NAND gate', () => {
      const nand = NAND();
      expect(nand.gateType).toBe('NAND');
      expect(nand.pins.length).toBe(3);
    });

    it('should create NOR gate', () => {
      const nor = NOR();
      expect(nor.gateType).toBe('NOR');
      expect(nor.pins.length).toBe(3);
    });

    it('should auto-label by gate type', () => {
      const and1 = AND();
      const and2 = AND();
      const or1 = OR();
      expect(and1.label).toBe('AND1');
      expect(and2.label).toBe('AND2');
      expect(or1.label).toBe('OR1');
    });
  });

  describe('HIGH/LOW Constants', () => {
    it('should create HIGH with output pin', () => {
      const high = HIGH();
      expect(high.pins.length).toBe(1);
      expect(high.pin('out')).toBeDefined();
    });

    it('should create LOW with output pin', () => {
      const low = LOW();
      expect(low.pins.length).toBe(1);
      expect(low.pin('out')).toBeDefined();
    });

    it('should auto-label HIGH/LOW', () => {
      const h1 = HIGH();
      const h2 = HIGH();
      const l1 = LOW();
      expect(h1.label).toBe('HIGH1');
      expect(h2.label).toBe('HIGH2');
      expect(l1.label).toBe('LOW1');
    });

    it('should have correct toString', () => {
      const high = HIGH();
      const low = LOW();
      expect(high.toString()).toBe('HIGH');
      expect(low.toString()).toBe('LOW');
    });
  });

  describe('Clock Source', () => {
    it('should create CLK with output pin', () => {
      const clk = CLK(1000);
      expect(clk.pins.length).toBe(1);
      expect(clk.pin('out')).toBeDefined();
    });

    it('should store frequency', () => {
      const clk = CLK(1000);
      expect(clk.frequency).toBe(1000);
    });

    it('should have default 50% duty cycle', () => {
      const clk = CLK(1000);
      expect(clk.dutyCycle).toBe(0.5);
    });

    it('should support custom duty cycle', () => {
      const clk = CLK(1000, 0.25);
      expect(clk.dutyCycle).toBe(0.25);
    });

    it('should auto-label CLK', () => {
      const clk1 = CLK(1000);
      const clk2 = CLK(2000);
      expect(clk1.label).toBe('CLK1');
      expect(clk2.label).toBe('CLK2');
    });

    it('should have correct toString', () => {
      const clk = CLK(1000);
      expect(clk.toString()).toBe('CLK(1kHz)');
    });
  });

  describe('Logic Gate Circuits', () => {
    it('should connect NOT gate in circuit', () => {
      const not = NOT();
      const circuit = Circuit('NOT Circuit', { autoGround: false }, [
        [HIGH(), not.A],
        [not.Y, LED(RED), LOW()],
      ]);

      expect(circuit.components.length).toBe(4);
    });

    it('should create SR latch with NAND gates', () => {
      const nand1 = NAND();
      const nand2 = NAND();
      const circuit = Circuit('SR Latch', { autoGround: false }, [
        [HIGH(), nand1.A],       // S input
        [nand2.Y, nand1.B],      // Q_bar -> NAND1.B
        [nand1.Y, nand2.A],      // Q -> NAND2.A
        [HIGH(), nand2.B],       // R input
      ]);

      expect(circuit.components.length).toBe(4);
      expect(nand1.label).toBe('NAND1');
      expect(nand2.label).toBe('NAND2');
    });

    it('should use XOR with clock', () => {
      const xor = XOR();
      const circuit = Circuit('XOR Clock', { autoGround: false }, [
        [CLK(1000), xor.A],
        [HIGH(), xor.B],
      ]);

      expect(circuit.components.length).toBe(3);
    });
  });

  describe('Pin fullName', () => {
    it('should return correct fullName for logic gates', () => {
      const not = NOT();
      expect(not.pin('A').fullName).toBe('NOT1.A');
      expect(not.pin('Y').fullName).toBe('NOT1.Y');
    });

    it('should return correct fullName for AND gate', () => {
      const and = AND();
      expect(and.pin('A').fullName).toBe('AND1.A');
      expect(and.pin('B').fullName).toBe('AND1.B');
      expect(and.pin('Y').fullName).toBe('AND1.Y');
    });

    it('should return correct fullName for HIGH/LOW', () => {
      const high = HIGH();
      const low = LOW();
      expect(high.pin('out').fullName).toBe('HIGH1.out');
      expect(low.pin('out').fullName).toBe('LOW1.out');
    });

    it('should return correct fullName for CLK', () => {
      const clk = CLK(1000);
      expect(clk.pin('out').fullName).toBe('CLK1.out');
    });
  });
});
