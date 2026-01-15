/**
 * WireLang Core - DSL Helper Functions
 * Series and Parallel are NOT classes, they are helper functions
 * that produce Pin-Node bindings
 */

import { Component } from './Component';
import { Node } from './Node';
import { Pin } from './Pin';
import { Schematic } from './Schematic';

/**
 * Result of a DSL connection operation
 * Contains the components and their pin-node bindings
 */
export interface ConnectionResult {
  components: Component[];
  nodes: Node[];
  firstPin: Pin;
  lastPin: Pin;
}

/**
 * Item that can be used in Series/Parallel
 * Can be a Component or a Pin (for connecting to specific pins)
 */
export type Connectable = Component | Pin | ConnectionResult;

/**
 * Helper to extract first and last pins from a connectable
 */
function getTerminals(item: Connectable): { first: Pin; last: Pin; components: Component[]; nodes: Node[] } {
  if (item instanceof Pin) {
    return { first: item, last: item, components: [], nodes: [] };
  }
  
  if (item instanceof Component) {
    // For two-terminal components, use p1 and p2
    return { 
      first: item.p1, 
      last: item.p2, 
      components: [item],
      nodes: [],
    };
  }
  
  // ConnectionResult
  return {
    first: item.firstPin,
    last: item.lastPin,
    components: item.components,
    nodes: item.nodes,
  };
}

/**
 * Connect components in series
 * Each component's second pin connects to the next component's first pin
 * 
 * @example
 * const result = Series(DC(5), R(100), LED(RED), GND());
 */
export function Series(...items: Connectable[]): ConnectionResult {
  if (items.length === 0) {
    throw new Error('Series requires at least one component');
  }

  const allComponents: Component[] = [];
  const allNodes: Node[] = [];
  let firstPin: Pin | null = null;
  let lastPin: Pin | null = null;

  for (let i = 0; i < items.length; i++) {
    const terminals = getTerminals(items[i]);
    allComponents.push(...terminals.components);
    allNodes.push(...terminals.nodes);

    if (i === 0) {
      firstPin = terminals.first;
    }

    // Connect previous item's last pin to current item's first pin
    if (i > 0 && lastPin) {
      const node = new Node();
      allNodes.push(node);
      lastPin.connectTo(node);
      terminals.first.connectTo(node);
    }

    lastPin = terminals.last;
  }

  return {
    components: allComponents,
    nodes: allNodes,
    firstPin: firstPin!,
    lastPin: lastPin!,
  };
}

/**
 * Connect components in parallel
 * All first pins connect to one node, all second pins connect to another
 * 
 * @example
 * const result = Parallel(R(100), R(200), R(300));
 */
export function Parallel(...items: Connectable[]): ConnectionResult {
  if (items.length === 0) {
    throw new Error('Parallel requires at least one component');
  }

  const allComponents: Component[] = [];
  const allNodes: Node[] = [];
  
  const startNode = new Node();
  const endNode = new Node();
  allNodes.push(startNode, endNode);

  for (const item of items) {
    const terminals = getTerminals(item);
    allComponents.push(...terminals.components);
    allNodes.push(...terminals.nodes);

    terminals.first.connectTo(startNode);
    terminals.last.connectTo(endNode);
  }

  // Create virtual pins for the parallel combination
  const firstPin = new Pin('parallel_in');
  const lastPin = new Pin('parallel_out');
  firstPin.connectTo(startNode);
  lastPin.connectTo(endNode);

  return {
    components: allComponents,
    nodes: allNodes,
    firstPin,
    lastPin,
  };
}

/**
 * Connect a pin directly to ground
 */
export function toGround(pin: Pin, schematic: Schematic): void {
  pin.connectTo(schematic.groundNode);
}

/**
 * Connect two pins together at a new node
 */
export function wire(pin1: Pin, pin2: Pin): Node {
  const node = new Node();
  pin1.connectTo(node);
  pin2.connectTo(node);
  return node;
}

/**
 * Connect multiple pins together at a new node
 */
export function junction(...pins: Pin[]): Node {
  if (pins.length < 2) {
    throw new Error('Junction requires at least two pins');
  }
  
  const node = new Node();
  for (const pin of pins) {
    pin.connectTo(node);
  }
  return node;
}

/**
 * Apply a connection result to a schematic
 * Adds all components and nodes from the result to the schematic
 */
export function applyToCircuit(schematic: Schematic, result: ConnectionResult): Schematic {
  for (const component of result.components) {
    schematic.addComponent(component);
  }
  for (const node of result.nodes) {
    schematic.addNode(node);
  }
  return schematic;
}

/**
 * Create a complete circuit from a series/parallel connection
 * Convenience function that creates a schematic and applies connections
 */
export function Circuit(name: string, ...items: Connectable[]): Schematic {
  const s = new Schematic(name);
  const result = Series(...items);
  return applyToCircuit(s, result);
}
