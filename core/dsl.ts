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
 * Path item: Component, Pin, or nested ConnectionResult
 */
export type PathItem = Component | Pin | ConnectionResult;

/**
 * A path is an array of items to connect in series
 */
export type Path = PathItem[];

/**
 * Circuit definition can be:
 * - Simple: Component[] (legacy, treated as single series path)
 * - Array-based: Path[] (each inner array is a separate path)
 */
export type CircuitDefinition = Connectable[] | Path[];

/**
 * Check if the definition is array-based (array of arrays)
 */
function isArrayBasedDefinition(items: CircuitDefinition): items is Path[] {
  return items.length > 0 && Array.isArray(items[0]);
}

/**
 * Connect items in a single path (series connection)
 * Returns all components and nodes created
 */
function connectPath(path: Path): { components: Component[]; nodes: Node[] } {
  const components: Component[] = [];
  const nodes: Node[] = [];

  for (let i = 0; i < path.length; i++) {
    const item = path[i];
    
    // Collect components
    if (item instanceof Component) {
      components.push(item);
    } else if (item instanceof Pin) {
      // If it's a pin, get the component that owns it
      const owner = item.component;
      if (owner && owner instanceof Component) {
        components.push(owner);
      }
    } else if ('components' in item) {
      components.push(...item.components);
      nodes.push(...item.nodes);
    }
  }

  // Connect adjacent items
  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];
    
    // Get the output pin of current item
    const outPin = getOutputPin(current);
    // Get the input pin of next item
    const inPin = getInputPin(next);
    
    // If either pin already has a node, use that node
    // Otherwise create a new one
    let node: Node;
    
    if (outPin.isConnected() && outPin.node) {
      node = outPin.node;
    } else if (inPin.isConnected() && inPin.node) {
      node = inPin.node;
    } else {
      node = new Node();
      nodes.push(node);
    }
    
    // Connect both pins to the node (connectTo handles already-connected case)
    if (!outPin.isConnectedTo(node)) {
      outPin.connectTo(node);
    }
    if (!inPin.isConnectedTo(node)) {
      inPin.connectTo(node);
    }
  }

  return { components, nodes };
}

/**
 * Get the output pin (last pin) of an item
 */
function getOutputPin(item: PathItem): Pin {
  if (item instanceof Pin) {
    return item;
  }
  if (item instanceof Component) {
    return item.p2;
  }
  // ConnectionResult
  return item.lastPin;
}

/**
 * Get the input pin (first pin) of an item
 */
function getInputPin(item: PathItem): Pin {
  if (item instanceof Pin) {
    return item;
  }
  if (item instanceof Component) {
    return item.p1;
  }
  // ConnectionResult
  return item.firstPin;
}

/**
 * Create a complete circuit from series/parallel connections or array-based paths
 * 
 * @example Simple (legacy):
 * Circuit('LED', DC(5), R(330), LED(RED), GND())
 * 
 * @example Array-based (for multi-pin components):
 * const t = NPN('2N2222');
 * Circuit('Switch', [
 *   [DC(5), R(330), LED(RED), t.C],
 *   [t.E, GND()],
 *   [DC(5), R(kOhm(10)), t.B],
 * ])
 */
/** Options for Circuit creation */
export interface CircuitOptions {
  /** Auto-connect unconnected DC/AC negative pins to GND (default: true) */
  autoGround?: boolean;
}

export function Circuit(name: string, ...items: Connectable[]): Schematic;
export function Circuit(name: string, paths: Path[]): Schematic;
export function Circuit(name: string, options: CircuitOptions, ...items: Connectable[]): Schematic;
export function Circuit(name: string, options: CircuitOptions, paths: Path[]): Schematic;
export function Circuit(name: string, ...args: unknown[]): Schematic {
  const s = new Schematic(name);
  
  // Parse options if provided
  let options: CircuitOptions = { autoGround: true };
  let restArgs = args;
  
  // Check if first arg is options object (not array, not Component, not Pin)
  if (args.length > 0 && 
      typeof args[0] === 'object' && 
      args[0] !== null &&
      !Array.isArray(args[0]) && 
      !(args[0] instanceof Component) && 
      !(args[0] instanceof Pin) &&
      !('components' in args[0])) {
    options = { ...options, ...(args[0] as CircuitOptions) };
    restArgs = args.slice(1);
  }
  
  // Check if first arg is an array of arrays (array-based syntax)
  if (restArgs.length === 1 && Array.isArray(restArgs[0]) && restArgs[0].length > 0 && Array.isArray(restArgs[0][0])) {
    // Array-based syntax: Circuit('name', [[...], [...], ...])
    const paths = restArgs[0] as Path[];
    const addedComponents = new Set<Component>();
    
    for (const path of paths) {
      const { components, nodes } = connectPath(path);
      
      // Add components (avoid duplicates)
      components.forEach(c => {
        if (!addedComponents.has(c)) {
          addedComponents.add(c);
          s.addComponent(c);
        }
      });
      
      nodes.forEach(n => s.addNode(n));
    }
    
    // Auto-connect grounds if enabled
    if (options.autoGround) {
      s.autoConnectGrounds();
    }
    
    return s;
  }
  
  // Legacy syntax: Circuit('name', DC(5), R(330), ...)
  const items = restArgs as Connectable[];
  const result = Series(...items);
  const schematic = applyToCircuit(s, result);
  
  // Auto-connect grounds if enabled
  if (options.autoGround) {
    schematic.autoConnectGrounds();
  }
  
  return schematic;
}
