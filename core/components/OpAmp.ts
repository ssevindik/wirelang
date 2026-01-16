/**
 * WireLang Core - Operational Amplifier Component
 * 5-pin OpAmp: inP (+), inN (-), out, vPos (V+), vNeg (V-)
 */

import { Component } from '../Component';
import { ComponentType, PinDirection } from '../types';
import { Pin } from '../Pin';

export interface OpAmpParams {
  /** Part number (e.g., 'LM741', 'TL072') */
  partNumber?: string;
  /** Open-loop gain (typical: 100000) */
  gain?: number;
}

/**
 * Operational Amplifier - 5 pin
 * 
 * Pinout:
 *   inP  - Non-inverting input (+)
 *   inN  - Inverting input (-)
 *   out  - Output
 *   vPos - Positive supply (V+)
 *   vNeg - Negative supply (V-)
 * 
 * Ideal OpAmp: Vout = A × (V+ - V-)
 */
export class OpAmpComponent extends Component {
  readonly partNumber: string;
  readonly gain: number;

  constructor(params: OpAmpParams | string = {}) {
    const normalized = typeof params === 'string' 
      ? { partNumber: params } 
      : params;
    
    super('opamp' as ComponentType, {
      value: normalized.gain ?? 100000,
      unit: 'V/V',
      partNumber: normalized.partNumber ?? 'Generic',
    });
    
    this.partNumber = normalized.partNumber ?? 'Generic';
    this.gain = normalized.gain ?? 100000;
  }

  protected createPins(): Pin[] {
    return [
      new Pin('inP', PinDirection.Input),    // Non-inverting (+)
      new Pin('inN', PinDirection.Input),    // Inverting (-)
      new Pin('out', PinDirection.Output),   // Output
      new Pin('vPos', PinDirection.Input),   // V+ supply
      new Pin('vNeg', PinDirection.Input),   // V- supply
    ];
  }

  protected getTypePrefix(): string {
    return 'U'; // IC prefix
  }

  /** Non-inverting input (+) */
  get inP(): Pin {
    return this.pins[0];
  }

  /** Inverting input (-) */
  get inN(): Pin {
    return this.pins[1];
  }

  /** Output */
  get out(): Pin {
    return this.pins[2];
  }

  /** Positive supply (V+) */
  get vPos(): Pin {
    return this.pins[3];
  }

  /** Negative supply (V-) */
  get vNeg(): Pin {
    return this.pins[4];
  }

  // Series: inP -> out
  get p1(): Pin {
    return this.inP;
  }

  get p2(): Pin {
    return this.out;
  }

  validate(): string[] {
    const errors: string[] = [];
    if (this.gain <= 0) {
      errors.push('OpAmp: Gain must be positive');
    }
    return errors;
  }

  toString(): string {
    return `OpAmp(${this.partNumber})`;
  }
}

/**
 * 3-pin Simplified OpAmp (without power pins)
 * For quick schematics where power is assumed
 */
export class OpAmp3Component extends Component {
  readonly partNumber: string;
  readonly gain: number;

  constructor(params: OpAmpParams | string = {}) {
    const normalized = typeof params === 'string' 
      ? { partNumber: params } 
      : params;
    
    super('opamp' as ComponentType, {
      value: normalized.gain ?? 100000,
      unit: 'V/V',
      partNumber: normalized.partNumber ?? 'Generic',
    });
    
    this.partNumber = normalized.partNumber ?? 'Generic';
    this.gain = normalized.gain ?? 100000;
  }

  protected createPins(): Pin[] {
    return [
      new Pin('inP', PinDirection.Input),    // Non-inverting (+)
      new Pin('inN', PinDirection.Input),    // Inverting (-)
      new Pin('out', PinDirection.Output),   // Output
    ];
  }

  protected getTypePrefix(): string {
    return 'U';
  }

  get inP(): Pin { return this.pins[0]; }
  get inN(): Pin { return this.pins[1]; }
  get out(): Pin { return this.pins[2]; }
  get p1(): Pin { return this.inP; }
  get p2(): Pin { return this.out; }

  validate(): string[] {
    const errors: string[] = [];
    if (this.gain <= 0) {
      errors.push('OpAmp: Gain must be positive');
    }
    return errors;
  }

  toString(): string {
    return `OpAmp3(${this.partNumber})`;
  }
}

/**
 * Factory function for 5-pin OpAmp (with power pins)
 */
export function OpAmp(partNumber?: string): OpAmpComponent {
  return new OpAmpComponent(partNumber ?? {});
}

/**
 * Factory function for 3-pin OpAmp (simplified, no power pins)
 */
export function OpAmp3(partNumber?: string): OpAmp3Component {
  return new OpAmp3Component(partNumber ?? {});
}

// Common OpAmp presets (5-pin)
export const LM741 = () => OpAmp('LM741');
export const TL072 = () => OpAmp('TL072');
export const NE5532 = () => OpAmp('NE5532');
export const LM358 = () => OpAmp('LM358');
