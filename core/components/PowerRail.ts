/**
 * WireLang Core - Power Rail Component
 * Single-pin power supply rails (VCC, VDD, etc.)
 */

import { Component } from '../Component';
import { ComponentType } from '../types';
import { Pin } from '../Pin';
import { formatWithUnit } from '../units';

/**
 * Power Rail - Single pin voltage source
 * Unlike VoltageSource (DC/AC), this has only one pin
 * Used for power distribution in circuits
 */
export class PowerRail extends Component {
  readonly voltage: number;
  readonly railName: string;

  constructor(voltage: number, name: string = 'VCC') {
    super(ComponentType.PowerRail, {
      value: voltage,
      unit: 'V',
      railName: name,
    }, name);
    
    this.voltage = voltage;
    this.railName = name;
  }

  protected createPins(): Pin[] {
    return [new Pin('out')];
  }

  protected getTypePrefix(): string {
    return this.railName;
  }

  /** The output pin */
  get out(): Pin {
    return this.pins[0];
  }

  /** Alias for p1 */
  get p1(): Pin {
    return this.pins[0];
  }

  /** No p2 for single-pin component */
  get p2(): Pin {
    return this.pins[0]; // Return same pin to avoid errors in Series
  }

  validate(): string[] {
    // Power rails can be any voltage, no validation needed
    return [];
  }

  toString(): string {
    return `${this.railName}(${formatWithUnit(this.voltage, 'V')})`;
  }
}

/**
 * VCC - Positive power rail (typically 3.3V, 5V, 12V)
 */
export function VCC(voltage: number = 5): PowerRail {
  return new PowerRail(voltage, 'VCC');
}

/**
 * VDD - Positive power rail (typically for digital ICs)
 */
export function VDD(voltage: number = 3.3): PowerRail {
  return new PowerRail(voltage, 'VDD');
}

/**
 * V+ - Positive supply for op-amps
 */
export function VPOS(voltage: number = 15): PowerRail {
  return new PowerRail(voltage, 'V+');
}

/**
 * V- - Negative supply for op-amps
 */
export function VNEG(voltage: number = -15): PowerRail {
  return new PowerRail(voltage, 'V-');
}
