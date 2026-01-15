/**
 * WireLang Core - Ground Component
 * Represents the reference node (0V) in a circuit
 */

import { Component } from '../Component';
import { ComponentType } from '../types';
import { Pin } from '../Pin';
import { Node, createGroundNode } from '../Node';

export class Ground extends Component {
  private _groundNode: Node | null = null;

  constructor() {
    super(ComponentType.Ground, {
      value: 0,
      unit: 'V',
    });
  }

  protected createPins(): Pin[] {
    return [new Pin('gnd')];
  }

  /**
   * Get the single ground pin
   */
  get pin(): Pin {
    return this.pins[0];
  }

  /**
   * Get or create the ground node
   */
  getGroundNode(): Node {
    if (!this._groundNode) {
      this._groundNode = createGroundNode();
      this.pin.connectTo(this._groundNode);
    }
    return this._groundNode;
  }

  validate(): string[] {
    // Ground has no validation errors
    return [];
  }

  toString(): string {
    return 'GND';
  }
}

/**
 * Factory function for DSL usage
 */
export function GND(): Ground {
  return new Ground();
}
