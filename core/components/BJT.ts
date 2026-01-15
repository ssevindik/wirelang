/**
 * WireLang Core - BJT Transistor Components
 * NPN and PNP bipolar junction transistors
 */

import { BJTComponent } from '../Component';
import { ComponentType } from '../types';

// Common BJT models with their typical parameters
const BJT_MODELS: Record<string, { hfe: number; vce_sat: number; vbe: number }> = {
  // NPN
  '2N2222': { hfe: 100, vce_sat: 0.3, vbe: 0.7 },
  '2N3904': { hfe: 150, vce_sat: 0.2, vbe: 0.7 },
  'BC547': { hfe: 200, vce_sat: 0.2, vbe: 0.7 },
  'BC548': { hfe: 200, vce_sat: 0.2, vbe: 0.7 },
  // PNP
  '2N2907': { hfe: 100, vce_sat: 0.3, vbe: 0.7 },
  '2N3906': { hfe: 150, vce_sat: 0.2, vbe: 0.7 },
  'BC557': { hfe: 200, vce_sat: 0.2, vbe: 0.7 },
  // Generic
  'generic': { hfe: 100, vce_sat: 0.3, vbe: 0.7 },
};

export interface BJTParams {
  model?: string;
  hfe?: number;       // Current gain (beta)
  vce_sat?: number;   // Saturation voltage
  vbe?: number;       // Base-emitter voltage
}

/**
 * NPN Bipolar Junction Transistor
 */
export class NPNTransistor extends BJTComponent {
  readonly model: string;
  readonly hfe: number;
  readonly vce_sat: number;
  readonly vbe: number;

  constructor(params: BJTParams | string = 'generic') {
    const normalized = typeof params === 'string' ? { model: params } : params;
    const model = normalized.model ?? 'generic';
    const defaults = BJT_MODELS[model] ?? BJT_MODELS['generic'];

    super(ComponentType.NPN, {
      value: normalized.hfe ?? defaults.hfe,
      unit: 'hfe',
      model,
    });

    this.model = model;
    this.hfe = normalized.hfe ?? defaults.hfe;
    this.vce_sat = normalized.vce_sat ?? defaults.vce_sat;
    this.vbe = normalized.vbe ?? defaults.vbe;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.hfe <= 0) {
      errors.push('NPN: hfe (current gain) must be positive');
    }
    
    return errors;
  }

  toString(): string {
    return `NPN(${this.model}, hfe=${this.hfe})`;
  }
}

/**
 * PNP Bipolar Junction Transistor
 */
export class PNPTransistor extends BJTComponent {
  readonly model: string;
  readonly hfe: number;
  readonly vce_sat: number;
  readonly vbe: number;

  constructor(params: BJTParams | string = 'generic') {
    const normalized = typeof params === 'string' ? { model: params } : params;
    const model = normalized.model ?? 'generic';
    const defaults = BJT_MODELS[model] ?? BJT_MODELS['generic'];

    super(ComponentType.PNP, {
      value: normalized.hfe ?? defaults.hfe,
      unit: 'hfe',
      model,
    });

    this.model = model;
    this.hfe = normalized.hfe ?? defaults.hfe;
    this.vce_sat = normalized.vce_sat ?? defaults.vce_sat;
    this.vbe = normalized.vbe ?? defaults.vbe;
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.hfe <= 0) {
      errors.push('PNP: hfe (current gain) must be positive');
    }
    
    return errors;
  }

  toString(): string {
    return `PNP(${this.model}, hfe=${this.hfe})`;
  }
}

/**
 * Factory function for NPN transistor
 */
export function NPN(params?: BJTParams | string): NPNTransistor {
  return new NPNTransistor(params);
}

/**
 * Factory function for PNP transistor
 */
export function PNP(params?: BJTParams | string): PNPTransistor {
  return new PNPTransistor(params);
}
