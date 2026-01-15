/**
 * WireLang Core - Resistor Component
 */

import { TwoTerminalComponent } from '../Component';
import { ComponentType } from '../types';
import { formatWithUnit } from '../units';

export class Resistor extends TwoTerminalComponent {
  constructor(resistance: number) {
    super(ComponentType.Resistor, {
      value: resistance,
      unit: 'Ω',
    });
  }

  /**
   * Get resistance value in Ohms
   */
  get resistance(): number {
    return this.params.value;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.params.value === 0) {
      errors.push('Resistor: Resistance cannot be zero (use a wire/short instead)');
    }
    
    return errors;
  }

  toString(): string {
    return `Resistor(${formatWithUnit(this.resistance, 'Ω')})`;
  }
}

/**
 * Factory function for DSL usage
 */
export function R(resistance: number): Resistor {
  return new Resistor(resistance);
}
