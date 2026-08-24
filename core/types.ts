/**
 * WireScript Core - Type Definitions
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
  // Transistors - BJT
  BJT = 'bjt',
  NPN = 'npn',
  PNP = 'pnp',
  // Transistors - MOSFET
  MOSFET = 'mosfet',
  NMOS = 'nmos',
  PMOS = 'pmos',
  // Transistors - JFET
  NJFET = 'njfet',
  PJFET = 'pjfet',
  // Integrated Circuits
  OpAmp = 'opamp',
  // Logic Gates
  LogicGate = 'logic_gate',
  LogicHigh = 'logic_high',
  LogicLow = 'logic_low',
  Clock = 'clock',
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
 * Electrical type of a pin.
 *
 * `PinDirection` describes *signal flow*; `PinType` describes what the pin
 * does electrically. ERC reasons about `PinType`, because a voltage source's
 * negative terminal flows "in" but is still a power output, and a resistor
 * terminal has no direction at all.
 */
export enum PinType {
  /** Consumes power, must be driven by a PowerOut on the same net (OpAmp V+/V-). */
  PowerIn = 'power_in',
  /** Supplies power / defines a potential (VCC, GND, battery terminals). */
  PowerOut = 'power_out',
  /** Signal input — needs a driver on its net (logic gate A/B, OpAmp inP/inN). */
  Input = 'input',
  /** Signal output — drives its net (logic gate Y, OpAmp out). */
  Output = 'output',
  /** Can drive or be driven (bus pins). */
  Bidirectional = 'bidirectional',
  /** Open-collector / open-drain output — may share a net with other OC pins. */
  OpenCollector = 'open_collector',
  /** Tri-state output — may share a net with other tri-state pins. */
  TriState = 'tri_state',
  /** No electrical direction (resistor, capacitor, diode, transistor terminals). */
  Passive = 'passive',
  /** Must be left unconnected. */
  NoConnect = 'no_connect',
  /** Unknown — ERC treats conservatively. */
  Unspecified = 'unspecified',
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
