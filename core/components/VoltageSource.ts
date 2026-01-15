/**
 * WireLang Core - Voltage Source Component
 */

import { Component } from '../Component';
import { ComponentType, SourceType, PinDirection } from '../types';
import { Pin } from '../Pin';
import { formatWithUnit } from '../units';

export interface VoltageSourceParams {
  voltage: number;
  sourceType?: SourceType;
  frequency?: number;  // For AC sources, in Hz
}

export class VoltageSource extends Component {
  readonly voltage: number;
  readonly sourceType: SourceType;
  readonly frequency?: number;

  constructor(params: VoltageSourceParams | number) {
    const normalized = typeof params === 'number' 
      ? { voltage: params } 
      : params;
    
    super(ComponentType.VoltageSource, {
      value: normalized.voltage,
      unit: 'V',
      sourceType: normalized.sourceType ?? SourceType.DC,
    });
    
    this.voltage = normalized.voltage;
    this.sourceType = normalized.sourceType ?? SourceType.DC;
    this.frequency = normalized.frequency;
  }

  protected createPins(): Pin[] {
    return [
      new Pin('positive', PinDirection.Output),
      new Pin('negative', PinDirection.Input),
    ];
  }

  get positive(): Pin {
    return this.pins[0];
  }

  get negative(): Pin {
    return this.pins[1];
  }

  /**
   * Override p1 to be negative (input) for correct series flow
   * Current flows: GND -> negative -> [internal] -> positive -> load
   */
  get p1(): Pin {
    return this.negative;
  }

  /**
   * Override p2 to be positive (output) for correct series flow
   */
  get p2(): Pin {
    return this.positive;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.sourceType === SourceType.AC && !this.frequency) {
      errors.push('VoltageSource: AC source requires frequency');
    }
    
    if (this.frequency !== undefined && this.frequency <= 0) {
      errors.push('VoltageSource: Frequency must be positive');
    }
    
    return errors;
  }

  toString(): string {
    const typeStr = this.sourceType === SourceType.DC ? 'DC' : 'AC';
    let str = `${typeStr}(${formatWithUnit(this.voltage, 'V')}`;
    if (this.frequency) {
      str += `, ${formatWithUnit(this.frequency, 'Hz')}`;
    }
    return str + ')';
  }
}

/**
 * Factory function for DC voltage source
 */
export function DC(voltage: number): VoltageSource {
  return new VoltageSource({ voltage, sourceType: SourceType.DC });
}

/**
 * Factory function for AC voltage source
 */
export function AC(voltage: number, frequency: number): VoltageSource {
  return new VoltageSource({ voltage, sourceType: SourceType.AC, frequency });
}
