/**
 * WireLang Core - Diode Component
 */

import { PolarizedTwoTerminalComponent } from '../Component';
import { ComponentType } from '../types';

export interface DiodeParams {
  forwardVoltage?: number;  // Vf in Volts
  maxCurrent?: number;      // Max forward current in Amps
  partNumber?: string;      // e.g., "1N4148"
}

export class Diode extends PolarizedTwoTerminalComponent {
  readonly forwardVoltage: number;
  readonly maxCurrent?: number;
  readonly partNumber?: string;

  constructor(params: DiodeParams = {}) {
    super(ComponentType.Diode, {
      value: params.forwardVoltage ?? 0.7,
      unit: 'V',
    });
    
    this.forwardVoltage = params.forwardVoltage ?? 0.7;
    this.maxCurrent = params.maxCurrent;
    this.partNumber = params.partNumber;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.forwardVoltage <= 0) {
      errors.push('Diode: Forward voltage must be positive');
    }
    
    if (this.maxCurrent !== undefined && this.maxCurrent <= 0) {
      errors.push('Diode: Maximum current must be positive');
    }
    
    return errors;
  }

  toString(): string {
    if (this.partNumber) {
      return `Diode(${this.partNumber})`;
    }
    return `Diode(Vf=${this.forwardVoltage}V)`;
  }
}

/**
 * Factory function for DSL usage
 */
export function D(params?: DiodeParams | string): Diode {
  if (typeof params === 'string') {
    return new Diode({ partNumber: params });
  }
  return new Diode(params);
}
