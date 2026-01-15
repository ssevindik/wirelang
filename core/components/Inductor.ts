/**
 * WireLang Core - Inductor Component
 */

import { TwoTerminalComponent } from '../Component';
import { ComponentType } from '../types';
import { formatWithUnit } from '../units';

export class Inductor extends TwoTerminalComponent {
  constructor(inductance: number) {
    super(ComponentType.Inductor, {
      value: inductance,
      unit: 'H',
    });
  }

  /**
   * Get inductance value in Henrys
   */
  get inductance(): number {
    return this.params.value;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.params.value === 0) {
      errors.push('Inductor: Inductance cannot be zero');
    }
    
    return errors;
  }

  toString(): string {
    return `Inductor(${formatWithUnit(this.inductance, 'H')})`;
  }
}

/**
 * Factory function for DSL usage
 */
export function L(inductance: number): Inductor {
  return new Inductor(inductance);
}
