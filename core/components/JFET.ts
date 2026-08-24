/**
 * WireScript Core - JFET Transistor Components
 * N-channel and P-channel junction field-effect transistors
 *
 * A JFET is depletion-mode: it conducts at Vgs = 0 and is pinched *off* by
 * driving the gate towards the source. That is the opposite of a MOSFET, and it
 * is why a JFET with a floating gate defaults to conducting.
 */

import { FETComponent } from '../Component';
import { ComponentType } from '../types';

/**
 * Common JFET models.
 *
 * `vgs_off` (pinch-off voltage) is negative for N-channel and positive for
 * P-channel; `idss` is the drain current at Vgs = 0.
 */
const JFET_MODELS: Record<string, { vgs_off: number; idss: number; rds_on: number }> = {
  // N-channel
  '2N3819': { vgs_off: -3.0, idss: 0.012, rds_on: 300 },
  '2N5457': { vgs_off: -1.5, idss: 0.003, rds_on: 400 },
  '2N5458': { vgs_off: -3.0, idss: 0.006, rds_on: 400 },
  'J201':   { vgs_off: -0.8, idss: 0.0006, rds_on: 700 },
  'BF245':  { vgs_off: -2.0, idss: 0.006, rds_on: 350 },
  // P-channel
  '2N5460': { vgs_off: 1.5, idss: 0.002, rds_on: 800 },
  '2N5461': { vgs_off: 3.0, idss: 0.004, rds_on: 800 },
  'J270':   { vgs_off: 2.0, idss: 0.006, rds_on: 500 },
  // Generic
  'generic': { vgs_off: -2.0, idss: 0.005, rds_on: 500 },
};

export interface JFETParams {
  model?: string;
  /** Pinch-off / gate-source cutoff voltage, in volts. */
  vgs_off?: number;
  /** Drain saturation current at Vgs = 0, in amps. */
  idss?: number;
  /** Channel resistance when fully on, in ohms. */
  rds_on?: number;
}

/**
 * N-channel JFET
 *
 * Pins: Gate (G), Drain (D), Source (S)
 */
export class NJFETTransistor extends FETComponent {
  readonly model: string;
  readonly vgs_off: number;
  readonly idss: number;
  readonly rds_on: number;

  constructor(params: JFETParams | string = 'generic') {
    const normalized = typeof params === 'string' ? { model: params } : params;
    const model = normalized.model ?? 'generic';
    const defaults = JFET_MODELS[model] ?? JFET_MODELS['generic'];

    super(ComponentType.NJFET, {
      value: normalized.vgs_off ?? defaults.vgs_off,
      unit: 'V',
      model,
      transistorType: 'NJFET',
    });

    this.model = model;
    this.vgs_off = normalized.vgs_off ?? defaults.vgs_off;
    this.idss = normalized.idss ?? defaults.idss;
    this.rds_on = normalized.rds_on ?? defaults.rds_on;
  }

  validate(): string[] {
    // `value` is vgs_off, which is legitimately negative for an N-channel JFET,
    // so the base "value cannot be negative" check does not apply here.
    const errors: string[] = [];

    if (this.vgs_off >= 0) {
      errors.push('NJFET: pinch-off voltage (vgs_off) must be negative for an N-channel JFET');
    }
    if (this.idss <= 0) {
      errors.push('NJFET: IDSS must be positive');
    }
    if (this.rds_on < 0) {
      errors.push('NJFET: Rds(on) cannot be negative');
    }

    return errors;
  }

  toString(): string {
    return `NJFET(${this.model}, Vgs(off)=${this.vgs_off}V)`;
  }
}

/**
 * P-channel JFET
 *
 * Pins: Gate (G), Drain (D), Source (S)
 */
export class PJFETTransistor extends FETComponent {
  readonly model: string;
  readonly vgs_off: number;
  readonly idss: number;
  readonly rds_on: number;

  constructor(params: JFETParams | string = 'generic') {
    const normalized = typeof params === 'string' ? { model: params } : params;
    const model = normalized.model ?? 'generic';
    const defaults = JFET_MODELS[model] ?? JFET_MODELS['generic'];

    super(ComponentType.PJFET, {
      value: normalized.vgs_off ?? Math.abs(defaults.vgs_off),
      unit: 'V',
      model,
      transistorType: 'PJFET',
    });

    this.model = model;
    this.vgs_off = normalized.vgs_off ?? Math.abs(defaults.vgs_off);
    this.idss = normalized.idss ?? defaults.idss;
    this.rds_on = normalized.rds_on ?? defaults.rds_on;
  }

  validate(): string[] {
    const errors: string[] = [];

    if (this.vgs_off <= 0) {
      errors.push('PJFET: pinch-off voltage (vgs_off) must be positive for a P-channel JFET');
    }
    if (this.idss <= 0) {
      errors.push('PJFET: IDSS must be positive');
    }
    if (this.rds_on < 0) {
      errors.push('PJFET: Rds(on) cannot be negative');
    }

    return errors;
  }

  toString(): string {
    return `PJFET(${this.model}, Vgs(off)=${this.vgs_off}V)`;
  }
}

/**
 * Factory function for an N-channel JFET
 *
 * @example
 * const j = NJFET('2N3819');
 * Circuit('Source follower', [
 *   [VCC(12), j.D],
 *   [j.S, R(kOhm(2.2)), GND()],
 *   [j.G, R(MOhm(1)), GND()],
 * ]);
 */
export function NJFET(params?: JFETParams | string): NJFETTransistor {
  return new NJFETTransistor(params);
}

/**
 * Factory function for a P-channel JFET
 */
export function PJFET(params?: JFETParams | string): PJFETTransistor {
  return new PJFETTransistor(params);
}
