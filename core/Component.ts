/**
 * WireLang Core - Component
 * Abstract base class for all circuit components
 */

import { ComponentType, ComponentParams, ComponentId } from './types';
import { Pin } from './Pin';

let componentCounter = 0;

export abstract class Component {
  readonly id: ComponentId;
  readonly type: ComponentType;
  readonly pins: Pin[];
  readonly params: ComponentParams;

  constructor(type: ComponentType, params: ComponentParams) {
    this.id = `${type}_${++componentCounter}`;
    this.type = type;
    this.params = params;
    this.pins = this.createPins();
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
