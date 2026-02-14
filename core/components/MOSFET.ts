/**
 * WireLang Core - MOSFET Components
 * N-channel and P-channel MOSFETs
 */

import { FETComponent } from '../Component';
import { ComponentType } from '../types';

// Common MOSFET models with their typical parameters
const MOSFET_MODELS: Record<string, { vth: number; rds_on: number; id_max: number }> = {
  // N-channel
  '2N7000': { vth: 2.1, rds_on: 5, id_max: 0.2 },
  'BS170': { vth: 2.1, rds_on: 5, id_max: 0.5 },
  'IRF540': { vth: 4.0, rds_on: 0.077, id_max: 28 },
  'IRF3205': { vth: 4.0, rds_on: 0.008, id_max: 110 },
  'IRLZ44N': { vth: 2.0, rds_on: 0.022, id_max: 47 },
  // P-channel
  'IRF9540': { vth: -4.0, rds_on: 0.2, id_max: 19 },
  'IRF5305': { vth: -4.0, rds_on: 0.06, id_max: 31 },
  // Generic
  'generic': { vth: 2.0, rds_on: 0.1, id_max: 1 },
};

export interface MOSFETParams {
  model?: string;
  vth?: number;       // Threshold voltage
  rds_on?: number;    // On-resistance (ohms)
  id_max?: number;    // Maximum drain current (A)
}

/**
 * N-channel MOSFET
 */
export class NMOSTransistor extends FETComponent {
  readonly model: string;
  readonly vth: number;
  readonly rds_on: number;
  readonly id_max: number;

  constructor(params: MOSFETParams | string = 'generic') {
    const normalized = typeof params === 'string' ? { model: params } : params;
    const model = normalized.model ?? 'generic';
    const defaults = MOSFET_MODELS[model] ?? MOSFET_MODELS['generic'];

    super(ComponentType.MOSFET, {
      value: normalized.vth ?? defaults.vth,
      unit: 'V',
      model,
      transistorType: 'NMOS',
    });

    this.model = model;
    this.vth = normalized.vth ?? defaults.vth;
    this.rds_on = normalized.rds_on ?? defaults.rds_on;
    this.id_max = normalized.id_max ?? defaults.id_max;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.rds_on < 0) {
      errors.push('NMOS: Rds(on) cannot be negative');
    }
    
    if (this.id_max <= 0) {
      errors.push('NMOS: Max drain current must be positive');
    }
    
    return errors;
  }

  toString(): string {
    return `NMOS(${this.model}, Vth=${this.vth}V)`;
  }
}

/**
 * P-channel MOSFET
 */
export class PMOSTransistor extends FETComponent {
  readonly model: string;
  readonly vth: number;
  readonly rds_on: number;
  readonly id_max: number;

  constructor(params: MOSFETParams | string = 'generic') {
    const normalized = typeof params === 'string' ? { model: params } : params;
    const model = normalized.model ?? 'generic';
    const defaults = MOSFET_MODELS[model] ?? MOSFET_MODELS['generic'];

    super(ComponentType.MOSFET, {
      value: normalized.vth ?? Math.abs(defaults.vth) * -1,
      unit: 'V',
      model,
      transistorType: 'PMOS',
    });

    this.model = model;
    this.vth = normalized.vth ?? defaults.vth;
    this.rds_on = normalized.rds_on ?? defaults.rds_on;
    this.id_max = normalized.id_max ?? defaults.id_max;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.rds_on < 0) {
      errors.push('PMOS: Rds(on) cannot be negative');
    }
    
    if (this.id_max <= 0) {
      errors.push('PMOS: Max drain current must be positive');
    }
    
    return errors;
  }

  toString(): string {
    return `PMOS(${this.model}, Vth=${this.vth}V)`;
  }
}

/**
 * Factory function for N-channel MOSFET
 */
export function NMOS(params?: MOSFETParams | string): NMOSTransistor {
  return new NMOSTransistor(params);
}

/**
 * Factory function for P-channel MOSFET
 */
export function PMOS(params?: MOSFETParams | string): PMOSTransistor {
  return new PMOSTransistor(params);
}
