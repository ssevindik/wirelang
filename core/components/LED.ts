/**
 * WireLang Core - LED Component
 */

import { PolarizedTwoTerminalComponent } from '../Component';
import { ComponentType, Color } from '../types';

// Typical forward voltages by LED color
const LED_FORWARD_VOLTAGES: Partial<Record<Color, number>> = {
  [Color.Red]: 1.8,
  [Color.Orange]: 2.0,
  [Color.Yellow]: 2.1,
  [Color.Green]: 2.2,
  [Color.Blue]: 3.2,
  [Color.White]: 3.2,
  [Color.Purple]: 3.2,
  [Color.Cyan]: 3.2,
  [Color.Pink]: 3.0,
  [Color.Amber]: 2.0,
  [Color.IR]: 1.2,   // Infrared LED
  [Color.UV]: 3.5,   // Ultraviolet LED
};

export interface LEDParams {
  color?: Color;
  forwardVoltage?: number;
  maxCurrent?: number;  // Typically 20mA
}

export class LEDComponent extends PolarizedTwoTerminalComponent {
  readonly color: Color;
  readonly forwardVoltage: number;
  readonly maxCurrent: number;

  constructor(params: LEDParams | Color = Color.Red) {
    const normalized = typeof params === 'string' 
      ? { color: params as Color } 
      : params;
    
    const color = normalized.color ?? Color.Red;
    const forwardVoltage = normalized.forwardVoltage ?? LED_FORWARD_VOLTAGES[color] ?? 2.0;
    
    super(ComponentType.LED, {
      value: forwardVoltage,
      unit: 'V',
      color,
    });
    
    this.color = color;
    this.forwardVoltage = forwardVoltage;
    this.maxCurrent = normalized.maxCurrent ?? 0.02; // 20mA default
  }

  validate(): string[] {
    const errors = super.validate();
    
    if (this.forwardVoltage <= 0) {
      errors.push('LED: Forward voltage must be positive');
    }
    
    if (this.maxCurrent <= 0) {
      errors.push('LED: Maximum current must be positive');
    }
    
    return errors;
  }

  toString(): string {
    return `LED(${this.color}, Vf=${this.forwardVoltage}V)`;
  }
}

// Re-export Color for convenience (aliased as LEDColor for backwards compat)
export { Color, Color as LEDColor };

/**
 * Factory function for DSL usage
 */
export function LED(params?: LEDParams | Color): LEDComponent {
  return new LEDComponent(params);
}

// Alias for backwards compatibility
export const createLED = LED;

// Convenience color shortcuts
export const RED = Color.Red;
export const GREEN = Color.Green;
export const BLUE = Color.Blue;
export const YELLOW = Color.Yellow;
export const WHITE = Color.White;
export const ORANGE = Color.Orange;
export const PURPLE = Color.Purple;
export const CYAN = Color.Cyan;
export const PINK = Color.Pink;
export const AMBER = Color.Amber;
export const IR = Color.IR;
export const UV = Color.UV;
