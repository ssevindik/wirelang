/**
 * WireLang Core - Capacitor Component
 */

import { TwoTerminalComponent } from '../Component';
import { ComponentType } from '../types';
import { formatWithUnit } from '../units';

export class Capacitor extends TwoTerminalComponent {
  constructor(capacitance: number) {
    super(ComponentType.Capacitor, {
      value: capacitance,
      unit: 'F',
    });
  }

  /**
   * Get capacitance value in Farads
   */
  get capacitance(): number {
    return this.params.value;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.params.value === 0) {
      errors.push('Capacitor: Capacitance cannot be zero');
    }
    
    return errors;
  }

  toString(): string {
    return `Capacitor(${formatWithUnit(this.capacitance, 'F')})`;
  }
}

/**
 * Factory function for DSL usage
 */
export function C(capacitance: number): Capacitor {
  return new Capacitor(capacitance);
}
