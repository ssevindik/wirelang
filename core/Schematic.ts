/**
 * WireLang Core - Schematic
 * Container for components and nodes
 * The Schematic IS the IR (Intermediate Representation) in v1
 */

import { Component } from './Component';
import { Node, createGroundNode } from './Node';
import { Pin } from './Pin';

export interface SchematicValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class Schematic {
  readonly name: string;
  private _components: Component[] = [];
  private _nodes: Node[] = [];
  private _groundNode: Node | null = null;

  constructor(name: string = 'unnamed') {
    this.name = name;
  }

  /**
   * Get all components in the circuit
   */
  get components(): readonly Component[] {
    return this._components;
  }

  /**
   * Get all nodes in the circuit
   */
  get nodes(): readonly Node[] {
    return this._nodes;
  }

  /**
   * Get or create the ground node for this circuit
   */
  get groundNode(): Node {
    if (!this._groundNode) {
      this._groundNode = createGroundNode();
      this._nodes.push(this._groundNode);
    }
    return this._groundNode;
  }

  /**
   * Add a component to the circuit
   */
  addComponent(component: Component): this {
    this._components.push(component);
    return this;
  }

  /**
   * Add multiple components to the circuit
   */
  addComponents(...components: Component[]): this {
    components.forEach(c => this.addComponent(c));
    return this;
  }

  /**
   * Create a new node and add it to the circuit
   */
  createNode(name?: string): Node {
    const node = new Node(name);
    this._nodes.push(node);
    return node;
  }

  /**
   * Add an existing node to the circuit
   */
  addNode(node: Node): this {
    if (!this._nodes.includes(node)) {
      this._nodes.push(node);
    }
    return this;
  }

  /**
   * Connect a pin to a node
   */
  connect(pin: Pin, node: Node): this {
    pin.connectTo(node);
    this.addNode(node);
    return this;
  }

  /**
   * Connect multiple pins to the same node
   */
  connectAll(pins: Pin[], node: Node): this {
    pins.forEach(pin => pin.connectTo(node));
    this.addNode(node);
    return this;
  }

  /**
   * Get a component by ID
   */
  getComponentById(id: string): Component | undefined {
    return this._components.find(c => c.id === id);
  }

  /**
   * Get components by type
   */
  getComponentsByType(type: string): Component[] {
    return this._components.filter(c => c.type === type);
  }

  /**
   * Get all pins connected to a specific node
   */
  getPinsAtNode(node: Node): Pin[] {
    const pins: Pin[] = [];
    for (const component of this._components) {
      for (const pin of component.pins) {
        if (pin.isConnectedTo(node)) {
          pins.push(pin);
        }
      }
    }
    return pins;
  }

  /**
   * Get all unconnected pins in the circuit
   */
  getUnconnectedPins(): Pin[] {
    const pins: Pin[] = [];
    for (const component of this._components) {
      for (const pin of component.pins) {
        if (!pin.isConnected()) {
          pins.push(pin);
        }
      }
    }
    return pins;
  }

  /**
   * Validate the circuit topology and component values
   */
  validate(): SchematicValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate each component
    for (const component of this._components) {
      const componentErrors = component.validate();
      errors.push(...componentErrors);
    }

    // Check for unconnected pins
    const unconnectedPins = this.getUnconnectedPins();
    if (unconnectedPins.length > 0) {
      for (const pin of unconnectedPins) {
        warnings.push(`Unconnected pin: ${pin.name}`);
      }
    }

    // Check for isolated nodes (nodes with only one pin)
    for (const node of this._nodes) {
      const pinsAtNode = this.getPinsAtNode(node);
      if (pinsAtNode.length === 1 && !node.isGround()) {
        warnings.push(`Node ${node.toString()} has only one connection`);
      }
    }

    // Check if circuit has at least one component
    if (this._components.length === 0) {
      errors.push('Circuit has no components');
    }

    // Check for ground reference
    const hasGround = this._nodes.some(n => n.isGround()) || 
                      this._components.some(c => c.type === 'ground');
    if (!hasGround) {
      warnings.push('Circuit has no ground reference');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get a summary of the circuit
   */
  getSummary(): string {
    const lines: string[] = [
      `Circuit: ${this.name}`,
      `Components: ${this._components.length}`,
      `Nodes: ${this._nodes.length}`,
      '',
      'Components:',
    ];

    for (const component of this._components) {
      lines.push(`  ${component.toString()}`);
    }

    lines.push('', 'Topology:');
    for (const node of this._nodes) {
      const pins = this.getPinsAtNode(node);
      if (pins.length > 0) {
        const pinNames = pins.map(p => p.name).join(', ');
        lines.push(`  ${node.toString()}: [${pinNames}]`);
      }
    }

    return lines.join('\n');
  }

  toString(): string {
    return `Schematic(${this.name}, ${this._components.length} components, ${this._nodes.length} nodes)`;
  }
}

/**
 * Factory function for creating a new schematic
 */
export function createSchematic(name?: string): Schematic {
  return new Schematic(name);
}
