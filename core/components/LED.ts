/**
 * WireLang Core - LED Component
 */

import { PolarizedTwoTerminalComponent } from '../Component';
import { ComponentType, LEDColor } from '../types';

// Typical forward voltages by color
const LED_FORWARD_VOLTAGES: Record<LEDColor, number> = {
  [LEDColor.Red]: 1.8,
  [LEDColor.Orange]: 2.0,
  [LEDColor.Yellow]: 2.1,
  [LEDColor.Green]: 2.2,
  [LEDColor.Blue]: 3.2,
  [LEDColor.White]: 3.2,
};

export interface LEDParams {
  color?: LEDColor;
  forwardVoltage?: number;
  maxCurrent?: number;  // Typically 20mA
}

export class LED extends PolarizedTwoTerminalComponent {
  readonly color: LEDColor;
  readonly forwardVoltage: number;
  readonly maxCurrent: number;

  constructor(params: LEDParams | LEDColor = LEDColor.Red) {
    const normalized = typeof params === 'string' 
      ? { color: params } 
      : params;
    
    const color = normalized.color ?? LEDColor.Red;
    const forwardVoltage = normalized.forwardVoltage ?? LED_FORWARD_VOLTAGES[color];
    
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

// Re-export colors for convenience
export { LEDColor };

/**
 * Factory functions for DSL usage
 */
export function createLED(params?: LEDParams | LEDColor): LED {
  return new LED(params);
}

// Convenience shortcuts
export const RED = LEDColor.Red;
export const GREEN = LEDColor.Green;
export const BLUE = LEDColor.Blue;
export const YELLOW = LEDColor.Yellow;
export const WHITE = LEDColor.White;
export const ORANGE = LEDColor.Orange;
