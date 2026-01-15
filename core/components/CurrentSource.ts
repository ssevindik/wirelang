/**
 * WireLang Core - Current Source Component
 */

import { Component } from '../Component';
import { ComponentType, SourceType, PinDirection } from '../types';
import { Pin } from '../Pin';
import { formatWithUnit } from '../units';

export interface CurrentSourceParams {
  current: number;
  sourceType?: SourceType;
  frequency?: number;  // For AC sources, in Hz
}

export class CurrentSource extends Component {
  readonly current: number;
  readonly sourceType: SourceType;
  readonly frequency?: number;

  constructor(params: CurrentSourceParams | number) {
    const normalized = typeof params === 'number' 
      ? { current: params } 
      : params;
    
    super(ComponentType.CurrentSource, {
      value: normalized.current,
      unit: 'A',
      sourceType: normalized.sourceType ?? SourceType.DC,
    });
    
    this.current = normalized.current;
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
      errors.push('CurrentSource: AC source requires frequency');
    }
    
    if (this.frequency !== undefined && this.frequency <= 0) {
      errors.push('CurrentSource: Frequency must be positive');
    }
    
    return errors;
  }

  toString(): string {
    const typeStr = this.sourceType === SourceType.DC ? 'DC' : 'AC';
    let str = `I_${typeStr}(${formatWithUnit(this.current, 'A')}`;
    if (this.frequency) {
      str += `, ${formatWithUnit(this.frequency, 'Hz')}`;
    }
    return str + ')';
  }
}

/**
 * Factory function for DC current source
 */
export function IDC(current: number): CurrentSource {
  return new CurrentSource({ current, sourceType: SourceType.DC });
}

/**
 * Factory function for AC current source
 */
export function IAC(current: number, frequency: number): CurrentSource {
  return new CurrentSource({ current, sourceType: SourceType.AC, frequency });
}
