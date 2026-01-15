/**
 * WireLang Core - Unit System
 * Utility functions for SI unit multipliers
 * These are pure multiplier functions, not classes
 */

// SI Prefix Multipliers
export const PICO = 1e-12;
export const NANO = 1e-9;
export const MICRO = 1e-6;
export const MILLI = 1e-3;
export const KILO = 1e3;
export const MEGA = 1e6;
export const GIGA = 1e9;

// Resistance (Ohm)
export const ohm = (value: number): number => value;
export const kOhm = (value: number): number => value * KILO;
export const MOhm = (value: number): number => value * MEGA;

// Capacitance (Farad)
export const F = (value: number): number => value;
export const mF = (value: number): number => value * MILLI;
export const uF = (value: number): number => value * MICRO;
export const nF = (value: number): number => value * NANO;
export const pF = (value: number): number => value * PICO;

// Inductance (Henry)
export const H = (value: number): number => value;
export const mH = (value: number): number => value * MILLI;
export const uH = (value: number): number => value * MICRO;
export const nH = (value: number): number => value * NANO;

// Voltage (Volt)
export const V = (value: number): number => value;
export const mV = (value: number): number => value * MILLI;
export const uV = (value: number): number => value * MICRO;
export const kV = (value: number): number => value * KILO;

// Current (Ampere)
export const A = (value: number): number => value;
export const mA = (value: number): number => value * MILLI;
export const uA = (value: number): number => value * MICRO;
export const nA = (value: number): number => value * NANO;

// Frequency (Hertz)
export const Hz = (value: number): number => value;
export const kHz = (value: number): number => value * KILO;
export const MHz = (value: number): number => value * MEGA;
export const GHz = (value: number): number => value * GIGA;

// Power (Watt)
export const W = (value: number): number => value;
export const mW = (value: number): number => value * MILLI;
export const uW = (value: number): number => value * MICRO;
export const kW = (value: number): number => value * KILO;

/**
 * Format a value with appropriate SI prefix
 */
export function formatWithUnit(value: number, baseUnit: string): string {
  const absValue = Math.abs(value);
  
  if (absValue >= GIGA) return `${value / GIGA}G${baseUnit}`;
  if (absValue >= MEGA) return `${value / MEGA}M${baseUnit}`;
  if (absValue >= KILO) return `${value / KILO}k${baseUnit}`;
  if (absValue >= 1) return `${value}${baseUnit}`;
  if (absValue >= MILLI) return `${value / MILLI}m${baseUnit}`;
  if (absValue >= MICRO) return `${value / MICRO}µ${baseUnit}`;
  if (absValue >= NANO) return `${value / NANO}n${baseUnit}`;
  if (absValue >= PICO) return `${value / PICO}p${baseUnit}`;
  
  return `${value}${baseUnit}`;
}

/**
 * Parse a value string with SI prefix to number
 */
export function parseWithUnit(valueStr: string): { value: number; unit: string } {
  const match = valueStr.match(/^([\d.]+)\s*([pnuµmkMG]?)(\w+)$/);
  if (!match) {
    throw new Error(`Invalid unit format: ${valueStr}`);
  }
  
  const [, numStr, prefix, unit] = match;
  let multiplier = 1;
  
  switch (prefix) {
    case 'p': multiplier = PICO; break;
    case 'n': multiplier = NANO; break;
    case 'u':
    case 'µ': multiplier = MICRO; break;
    case 'm': multiplier = MILLI; break;
    case 'k': multiplier = KILO; break;
    case 'M': multiplier = MEGA; break;
    case 'G': multiplier = GIGA; break;
  }
  
  return {
    value: parseFloat(numStr) * multiplier,
    unit,
  };
}
