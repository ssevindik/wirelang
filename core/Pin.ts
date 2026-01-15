/**
 * WireLang Core - Pin
 * Represents a connection point on a component
 */

import { PinDirection, PinId } from './types';
import { Node } from './Node';

let pinCounter = 0;

// Forward declaration to avoid circular dependency
type ComponentRef = { id: string; type: string };

export class Pin {
  readonly id: PinId;
  readonly name: string;
  readonly direction?: PinDirection;
  private _node: Node | null = null;
  private _component: ComponentRef | null = null;

  constructor(name: string, direction?: PinDirection) {
    this.id = `pin_${++pinCounter}`;
    this.name = name;
    this.direction = direction;
  }

  /**
   * Set the component that owns this pin (called by Component constructor)
   */
  setComponent(component: ComponentRef): void {
    this._component = component;
  }

  /**
   * Get the component that owns this pin
   */
  get component(): ComponentRef | null {
    return this._component;
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

  /**
   * Get a short label for this pin including component name
   * e.g., "R1.1", "Q1.C", "LED1.anode"
   */
  get fullName(): string {
    if (this._component && 'label' in this._component) {
      return `${this._component.label}.${this.name}`;
    }
    return this.name;
  }

  toString(): string {
    const nodeStr = this._node ? ` -> ${this._node.toString()}` : ' (unconnected)';
    return `${this.fullName}${nodeStr}`;
  }

  /**
   * Reset pin counter (useful for testing)
   */
  static resetCounter(): void {
    pinCounter = 0;
  }
}
