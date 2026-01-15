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
export { Component, TwoTerminalComponent, PolarizedTwoTerminalComponent } from './Component';
export { Circuit, createCircuit, type CircuitValidationResult } from './Circuit';

// Components
export {
  Resistor, R,
  Capacitor, C,
  Inductor, L,
  Diode, D,
  LEDComponent, LED, createLED, RED, GREEN, BLUE, YELLOW, WHITE, ORANGE,
  VoltageSource, DC, AC,
  CurrentSource, I_DC, I_AC,
  Ground, GND,
  type DiodeParams,
  type LEDParams,
  type VoltageSourceParams,
  type CurrentSourceParams,
} from './components';

// DSL Functions
export {
  Series,
  Parallel,
  toGround,
  wire,
  junction,
  applyToCircuit,
  buildCircuit,
  type ConnectionResult,
  type Connectable,
} from './dsl';
