/**
 * WireLang Core - Pin
 * Represents a connection point on a component
 */

import { PinDirection, PinId } from './types';
import { Node } from './Node';

let pinCounter = 0;

export class Pin {
  readonly id: PinId;
  readonly name: string;
  readonly direction?: PinDirection;
  private _node: Node | null = null;

  constructor(name: string, direction?: PinDirection) {
    this.id = `pin_${++pinCounter}`;
    this.name = name;
    this.direction = direction;
  }

  /**
   * Get the node this pin is connected to
   */
  get node(): Node | null {
    return this._node;
  }

  /**
   * Connect this pin to a node
   */
  connectTo(node: Node): void {
    this._node = node;
  }

  /**
   * Disconnect this pin from its node
   */
  disconnect(): void {
    this._node = null;
  }

  /**
   * Check if this pin is connected to any node
   */
  isConnected(): boolean {
    return this._node !== null;
  }

  /**
   * Check if this pin is connected to a specific node
   */
  isConnectedTo(node: Node): boolean {
    return this._node === node;
  }

  toString(): string {
    const nodeStr = this._node ? ` -> ${this._node.toString()}` : ' (unconnected)';
    return `Pin(${this.name})${nodeStr}`;
  }

  /**
   * Reset pin counter (useful for testing)
   */
  static resetCounter(): void {
    pinCounter = 0;
  }
}
