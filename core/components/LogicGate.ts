/**
 * WireLang Core - Logic Gate Components
 * Basic digital logic gates: NOT, AND, OR, XOR, NAND, NOR
 * Plus HIGH/LOW constants and CLK source
 */

import { Component } from '../Component';
import { ComponentType, PinDirection } from '../types';
import { Pin } from '../Pin';
import { formatWithUnit } from '../units';

// ============================================
// Logic Gate Types
// ============================================

export type GateType = 'NOT' | 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'BUFFER';

// ============================================
// Base Logic Gate Class
// ============================================

abstract class LogicGate extends Component {
  readonly gateType: GateType;
  readonly family: string;  // e.g., '74HC', '74LS', 'CD4000'

  constructor(gateType: GateType, inputCount: number, family: string = '74HC') {
    super(ComponentType.LogicGate, {
      value: inputCount,
      unit: 'inputs',
      gateType,
      family,
      labelPrefix: gateType,  // Use gate type as label prefix
    });
    this.gateType = gateType;
    this.family = family;
  }

  protected getTypePrefix(): string {
    return this.gateType;
  }

  toString(): string {
    return `${this.gateType}(${this.family})`;
  }
}

// ============================================
// NOT Gate (Inverter) - 1 input
// ============================================

export class NOTGate extends LogicGate {
  constructor(family: string = '74HC') {
    super('NOT', 1, family);
  }

  protected createPins(): Pin[] {
    return [
      new Pin('A', PinDirection.Input),
      new Pin('Y', PinDirection.Output),
    ];
  }

  get A(): Pin { return this.pins[0]; }
  get Y(): Pin { return this.pins[1]; }
  get p1(): Pin { return this.A; }
  get p2(): Pin { return this.Y; }

  validate(): string[] { return []; }
}

// ============================================
// 2-Input Logic Gates
// ============================================

abstract class TwoInputGate extends LogicGate {
  constructor(gateType: GateType, family: string = '74HC') {
    super(gateType, 2, family);
  }

  protected createPins(): Pin[] {
    return [
      new Pin('A', PinDirection.Input),
      new Pin('B', PinDirection.Input),
      new Pin('Y', PinDirection.Output),
    ];
  }

  get A(): Pin { return this.pins[0]; }
  get B(): Pin { return this.pins[1]; }
  get Y(): Pin { return this.pins[2]; }
  get p1(): Pin { return this.A; }
  get p2(): Pin { return this.Y; }

  validate(): string[] { return []; }
}

export class ANDGate extends TwoInputGate {
  constructor(family: string = '74HC') { super('AND', family); }
}

export class ORGate extends TwoInputGate {
  constructor(family: string = '74HC') { super('OR', family); }
}

export class XORGate extends TwoInputGate {
  constructor(family: string = '74HC') { super('XOR', family); }
}

export class NANDGate extends TwoInputGate {
  constructor(family: string = '74HC') { super('NAND', family); }
}

export class NORGate extends TwoInputGate {
  constructor(family: string = '74HC') { super('NOR', family); }
}

// ============================================
// HIGH / LOW Constant Logic Levels
// ============================================

export class LogicHigh extends Component {
  constructor() {
    super('logic_high' as ComponentType, {
      value: 1,
      unit: 'logic',
    });
  }

  protected createPins(): Pin[] {
    return [new Pin('out', PinDirection.Output)];
  }

  protected getTypePrefix(): string {
    return 'HIGH';
  }

  get out(): Pin { return this.pins[0]; }
  get p1(): Pin { return this.out; }
  get p2(): Pin { return this.out; }

  validate(): string[] { return []; }
  toString(): string { return 'HIGH'; }
}

export class LogicLow extends Component {
  constructor() {
    super('logic_low' as ComponentType, {
      value: 0,
      unit: 'logic',
    });
  }

  protected createPins(): Pin[] {
    return [new Pin('out', PinDirection.Output)];
  }

  protected getTypePrefix(): string {
    return 'LOW';
  }

  get out(): Pin { return this.pins[0]; }
  get p1(): Pin { return this.out; }
  get p2(): Pin { return this.out; }

  validate(): string[] { return []; }
  toString(): string { return 'LOW'; }
}

// ============================================
// Clock Source
// ============================================

export class ClockSource extends Component {
  readonly frequency: number;
  readonly dutyCycle: number;

  constructor(frequency: number, dutyCycle: number = 0.5) {
    super('clock' as ComponentType, {
      value: frequency,
      unit: 'Hz',
      dutyCycle,
    });
    this.frequency = frequency;
    this.dutyCycle = dutyCycle;
  }

  protected createPins(): Pin[] {
    return [new Pin('out', PinDirection.Output)];
  }

  protected getTypePrefix(): string {
    return 'CLK';
  }

  get out(): Pin { return this.pins[0]; }
  get p1(): Pin { return this.out; }
  get p2(): Pin { return this.out; }

  validate(): string[] {
    const errors: string[] = [];
    if (this.frequency <= 0) {
      errors.push('Clock: Frequency must be positive');
    }
    if (this.dutyCycle < 0 || this.dutyCycle > 1) {
      errors.push('Clock: Duty cycle must be between 0 and 1');
    }
    return errors;
  }

  toString(): string {
    return `CLK(${formatWithUnit(this.frequency, 'Hz')})`;
  }
}

// ============================================
// Factory Functions
// ============================================

export function NOT(family?: string): NOTGate {
  return new NOTGate(family);
}

export function AND(family?: string): ANDGate {
  return new ANDGate(family);
}

export function OR(family?: string): ORGate {
  return new ORGate(family);
}

export function XOR(family?: string): XORGate {
  return new XORGate(family);
}

export function NAND(family?: string): NANDGate {
  return new NANDGate(family);
}

export function NOR(family?: string): NORGate {
  return new NORGate(family);
}

export function HIGH(): LogicHigh {
  return new LogicHigh();
}

export function LOW(): LogicLow {
  return new LogicLow();
}

export function CLK(frequency: number, dutyCycle?: number): ClockSource {
  return new ClockSource(frequency, dutyCycle);
}
