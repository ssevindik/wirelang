/**
 * WireLang Core - Type Definitions
 * Minimal enums and type definitions for circuit components
 */

export enum ComponentType {
  Resistor = 'resistor',
  Capacitor = 'capacitor',
  Inductor = 'inductor',
  Diode = 'diode',
  LED = 'led',
  VoltageSource = 'voltage_source',
  CurrentSource = 'current_source',
  Ground = 'ground',
  PowerRail = 'power_rail',  // VCC, VDD, etc.
  // Transistors
  NPN = 'npn',
  PNP = 'pnp',
  NMOS = 'nmos',
  PMOS = 'pmos',
  NJFET = 'njfet',
  PJFET = 'pjfet',
}

export enum SourceType {
  DC = 'dc',
  AC = 'ac',
}

export enum PinDirection {
  Input = 'input',
  Output = 'output',
  Bidirectional = 'bidirectional',
}

/**
 * General color enum for components (LEDs, sensors, indicators, etc.)
 */
export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
  White = 'white',
  Orange = 'orange',
  Purple = 'purple',
  Cyan = 'cyan',
  Pink = 'pink',
  Amber = 'amber',
  IR = 'infrared',     // Infrared - sensors, IR LEDs
  UV = 'ultraviolet',  // Ultraviolet - UV LEDs, sensors
}

export interface ComponentParams {
  value: number;
  unit: string;
  [key: string]: unknown;
}

export type NodeId = string;
export type ComponentId = string;
export type PinId = string;
