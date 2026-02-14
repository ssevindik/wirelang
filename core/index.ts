/**
 * WireLang Core v1
 * A code-first DSL for describing electronic circuits
 * 
 * Core's only job: "which pin is connected to which node 
 * and what is this component's physical parameter"
 * 
 * NO: UI, simulation, rendering, coordinates
 * YES: topology + value validation
 */

// Types and Enums
export {
  ComponentType,
  SourceType,
  PinDirection,
  Color,
  Color as LEDColor,  // Backwards compatibility alias
  type ComponentParams,
  type NodeId,
  type ComponentId,
  type PinId,
} from './types';

// Unit utilities
export {
  // SI Prefix constants
  PICO, NANO, MICRO, MILLI, KILO, MEGA, GIGA,
  // Resistance
  ohm, kOhm, MOhm,
  // Capacitance
  F, mF, uF, nF, pF,
  // Inductance
  H, mH, uH, nH,
  // Voltage
  V, mV, uV, kV,
  // Current
  A, mA, uA, nA,
  // Frequency
  Hz, kHz, MHz, GHz,
  // Power
  W, mW, uW, kW,
  // Utility functions
  formatWithUnit,
  parseWithUnit,
} from './units';

// Core Classes
export { Pin } from './Pin';
export { Node, createGroundNode } from './Node';
export { 
  Component, 
  TwoTerminalComponent, 
  PolarizedTwoTerminalComponent,
  ThreeTerminalComponent,
  BJTComponent,
  FETComponent,
  resetCounters,  // For testing
} from './Component';
export { Schematic, createSchematic, type SchematicValidationResult } from './Schematic';

// DB transforms and identity helpers
export {
  compileDslToDb,
  reverseDbToDsl,
  dslToDb,
  dbToDsl,
  dsl2db,
  db2dsl,
  type WireLangDb,
  type DbComponent,
  type DbNode,
  type DbPin,
  type DbToDslOptions,
} from './db';
export {
  applyComponentIdentity,
  applyNodeIdentity,
  applyPinIdentity,
  type ComponentIdentity,
} from './identity';

// Components
export {
  // Passive
  Resistor, R,
  Capacitor, C,
  Inductor, L,
  // Diodes
  Diode, D,
  LEDComponent, LED, createLED, RED, GREEN, BLUE, YELLOW, WHITE, ORANGE, PURPLE, CYAN, PINK, AMBER, IR, UV,
  // Sources
  VoltageSource, DC, AC,
  CurrentSource, IDC, IAC,
  Ground, GND,
  // Power Rails
  PowerRail, VCC, VDD, VPOS, VNEG,
  // Transistors - BJT
  NPNTransistor, NPN,
  PNPTransistor, PNP,
  // Transistors - MOSFET
  NMOSTransistor, NMOS,
  PMOSTransistor, PMOS,
  // Analog ICs
  OpAmpComponent, OpAmp3Component, OpAmp, OpAmp3, LM741, TL072, NE5532, LM358,
  // Logic Gates
  NOTGate, ANDGate, ORGate, XORGate, NANDGate, NORGate,
  NOT, AND, OR, XOR, NAND, NOR,
  LogicHigh, LogicLow, HIGH, LOW,
  ClockSource, CLK,
  // Types
  type DiodeParams,
  type LEDParams,
  type VoltageSourceParams,
  type CurrentSourceParams,
  type BJTParams,
  type MOSFETParams,
  type OpAmpParams,
  type GateType,
} from './components';

// DSL Functions
export {
  Series,
  Parallel,
  toGround,
  wire,
  junction,
  applyToCircuit,
  Circuit,
  type ConnectionResult,
  type Connectable,
  type CircuitOptions,
} from './dsl';
