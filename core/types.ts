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

export enum LEDColor {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
  White = 'white',
  Orange = 'orange',
}

export interface ComponentParams {
  value: number;
  unit: string;
  [key: string]: unknown;
}

export type NodeId = string;
export type ComponentId = string;
export type PinId = string;
