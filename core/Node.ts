/**
 * WireLang Core - Node
 * Represents an electrical node in the circuit (topological reality)
 * A node is where multiple pins connect electrically
 */

import { NodeId } from './types';

let nodeCounter = 0;

export class Node {
  readonly id: NodeId;
  readonly name?: string;

  constructor(name?: string) {
    this.id = `node_${++nodeCounter}`;
    this.name = name;
  }

  /**
   * Check if this is a ground node
   */
  isGround(): boolean {
    return this.name === 'GND' || this.name === '0';
  }

  toString(): string {
    return this.name ? `Node(${this.name})` : `Node(${this.id})`;
  }

  /**
   * Reset node counter (useful for testing)
   */
  static resetCounter(): void {
    nodeCounter = 0;
  }
}

/**
 * Create a named ground node
 */
export function createGroundNode(): Node {
  return new Node('GND');
}
