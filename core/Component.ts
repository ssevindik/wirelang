/**
 * WireLang Core - Component
 * Abstract base class for all circuit components
 */

import { ComponentType, ComponentParams, ComponentId } from './types';
import { Pin } from './Pin';

let componentCounter = 0;
const typeCounters: Record<string, number> = {};

/**
 * Reset all component counters (useful for testing)
 */
export function resetCounters(): void {
  componentCounter = 0;
  for (const key in typeCounters) {
    delete typeCounters[key];
  }
}

export abstract class Component {
  readonly id: ComponentId;
  readonly type: ComponentType;
  readonly pins: Pin[];
  readonly params: ComponentParams;
  readonly label: string;  // Human-readable name like R1, C2, Q1

  constructor(type: ComponentType, params: ComponentParams, label?: string) {
    this.id = `${type}_${++componentCounter}`;
    this.type = type;
    this.params = params;
    
    // Generate auto-label if not provided (R1, R2, C1, Q1, etc.)
    if (label) {
      this.label = label;
    } else {
      // Check if params has a labelPrefix hint
      const prefix = (params as any).labelPrefix ?? this.getTypePrefix();
      typeCounters[prefix] = (typeCounters[prefix] || 0) + 1;
      this.label = `${prefix}${typeCounters[prefix]}`;
    }
    
    this.pins = this.createPins();
    
    // Set component reference on each pin
    for (const pin of this.pins) {
      pin.setComponent(this);
    }
  }

  /**
   * Get the standard prefix for this component type (R, C, L, Q, M, D, U, etc.)
   */
  protected getTypePrefix(): string {
    switch (this.type) {
      case ComponentType.Resistor: return 'R';
      case ComponentType.Capacitor: return 'C';
      case ComponentType.Inductor: return 'L';
      case ComponentType.Diode: return 'D';
      case ComponentType.LED: return 'LED';
      case ComponentType.VoltageSource: return 'V';
      case ComponentType.CurrentSource: return 'I';
      case ComponentType.Ground: return 'GND';
      case ComponentType.NPN:
      case ComponentType.PNP: return 'Q';  // BJT
      case ComponentType.NMOS:
      case ComponentType.PMOS:
      case ComponentType.NJFET:
      case ComponentType.PJFET: return 'M';  // FET
      default: return 'U';  // Unknown/IC
    }
  }

  /**
   * Create pins for this component
   * Must be implemented by subclasses
   */
  protected abstract createPins(): Pin[];

  /**
   * Get a pin by name
   */
  getPin(name: string): Pin | undefined {
    return this.pins.find(p => p.name === name);
  }

  /**
   * Get a pin by name (alias for getPin)
   */
  pin(name: string): Pin {
    const p = this.getPin(name);
    if (!p) {
      throw new Error(`Pin "${name}" not found on component ${this.label}`);
    }
    return p;
  }

  /**
   * Get the positive/input pin (for two-terminal components)
   */
  get p1(): Pin {
    return this.pins[0];
  }

  /**
   * Get the negative/output pin (for two-terminal components)
   */
  get p2(): Pin {
    return this.pins[1];
  }

  /**
   * Validate component parameters
   * Returns array of validation errors (empty if valid)
   */
  validate(): string[] {
    const errors: string[] = [];
    
    if (this.params.value < 0) {
      errors.push(`${this.type}: Value cannot be negative`);
    }
    
    return errors;
  }

  /**
   * Get human-readable description
   */
  abstract toString(): string;

  /**
   * Reset component counter (useful for testing)
   */
  static resetCounter(): void {
    componentCounter = 0;
    // Reset type counters too
    for (const key in typeCounters) {
      delete typeCounters[key];
    }
  }
}

/**
 * Base class for two-terminal passive components (R, C, L)
 */
export abstract class TwoTerminalComponent extends Component {
  protected createPins(): Pin[] {
    return [
      new Pin('1'),
      new Pin('2'),
    ];
  }
}

/**
 * Base class for polarized two-terminal components (diodes, LEDs)
 */
export abstract class PolarizedTwoTerminalComponent extends Component {
  protected createPins(): Pin[] {
    return [
      new Pin('anode'),
      new Pin('cathode'),
    ];
  }

  get anode(): Pin {
    return this.pins[0];
  }

  get cathode(): Pin {
    return this.pins[1];
  }
}

/**
 * Base class for three-terminal components (transistors)
 */
export abstract class ThreeTerminalComponent extends Component {
  get p1(): Pin {
    return this.pins[0];
  }

  get p2(): Pin {
    return this.pins[1];
  }

  get p3(): Pin {
    return this.pins[2];
  }
}

/**
 * Base class for BJT transistors (NPN, PNP)
 * Pins: Base (B), Collector (C), Emitter (E)
 */
export abstract class BJTComponent extends ThreeTerminalComponent {
  protected createPins(): Pin[] {
    return [
      new Pin('B'),  // Base
      new Pin('C'),  // Collector
      new Pin('E'),  // Emitter
    ];
  }

  /** Base pin */
  get B(): Pin {
    return this.pins[0];
  }

  /** Collector pin */
  get C(): Pin {
    return this.pins[1];
  }

  /** Emitter pin */
  get E(): Pin {
    return this.pins[2];
  }
}

/**
 * Base class for FET transistors (MOSFET, JFET)
 * Pins: Gate (G), Drain (D), Source (S)
 */
export abstract class FETComponent extends ThreeTerminalComponent {
  protected createPins(): Pin[] {
    return [
      new Pin('G'),  // Gate
      new Pin('D'),  // Drain
      new Pin('S'),  // Source
    ];
  }

  /** Gate pin */
  get G(): Pin {
    return this.pins[0];
  }

  /** Drain pin */
  get D(): Pin {
    return this.pins[1];
  }

  /** Source pin */
  get S(): Pin {
    return this.pins[2];
  }
}
