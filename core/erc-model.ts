/**
 * WireScript ERC — Circuit Analysis Model
 *
 * Builds the derived view of a `Schematic` that the ERC rules reason over:
 * nets (equipotential groups of pins), their classification and estimated DC
 * potential, and impedance-path queries between nets.
 *
 * This module contains no rules — only the facts rules are checked against.
 */

import { Component } from './Component';
import { Node } from './Node';
import { Pin } from './Pin';
import { Schematic } from './Schematic';
import { ComponentType, PinType } from './types';

// ─────────────────────────────────────────────────────────────
// Net model
// ─────────────────────────────────────────────────────────────

/** How a net behaves electrically. */
export type NetKind = 'ground' | 'power' | 'signal';

export interface Net {
  /** Underlying node id (nets and nodes are 1:1 in the WireScript IR). */
  readonly id: string;
  readonly node: Node;
  /** Display name — the node name if set, otherwise the node id. */
  readonly name: string;
  readonly pins: Pin[];
  readonly isGround: boolean;
  readonly kind: NetKind;
  /**
   * Estimated DC potential in volts, relative to ground.
   * Only set when a supply is *directly* attached to the net; `undefined`
   * means "requires simulation to know".
   */
  readonly potential?: number;
  /** Logic level forced onto this net by a HIGH()/LOW() constant, if any. */
  readonly logicLevel?: 0 | 1;
  /**
   * True when this net's potential comes from an AC source. `potential` is then
   * an amplitude, not a DC level — polarity rules do not apply, because the
   * sign reverses every half cycle.
   */
  readonly isAC?: boolean;
  /**
   * Potential asserted onto this net by an attached supply, before the ground
   * override. A net that carries both a rail and a ground symbol has
   * `potential === 0` but a non-zero `suppliedPotential` — that combination is
   * exactly a rail shorted to ground.
   */
  readonly suppliedPotential?: number;
}

/** Pin types that actively drive a net. */
const DRIVING_PIN_TYPES = new Set<PinType>([
  PinType.Output,
  PinType.PowerOut,
  PinType.Bidirectional,
  PinType.OpenCollector,
  PinType.TriState,
]);

/** Component types that supply power / define a potential. */
export const SUPPLY_TYPES = new Set<ComponentType>([
  ComponentType.VoltageSource,
  ComponentType.PowerRail,
  ComponentType.CurrentSource,
]);

/** Bipolar and field-effect transistors, whatever the concrete enum member. */
export const TRANSISTOR_TYPES = new Set<ComponentType>([
  ComponentType.BJT, ComponentType.NPN, ComponentType.PNP,
  ComponentType.MOSFET, ComponentType.NMOS, ComponentType.PMOS,
  ComponentType.NJFET, ComponentType.PJFET,
]);

/** Field-effect transistors only (gate-driven). */
export const FET_TYPES = new Set<ComponentType>([
  ComponentType.MOSFET, ComponentType.NMOS, ComponentType.PMOS,
  ComponentType.NJFET, ComponentType.PJFET,
]);

/** Integrated circuits — components that need a supply to work. */
export const IC_TYPES = new Set<ComponentType>([
  ComponentType.OpAmp,
  ComponentType.LogicGate,
]);

export function isDriver(pin: Pin): boolean {
  return DRIVING_PIN_TYPES.has(pin.type);
}

// ─────────────────────────────────────────────────────────────
// Impedance model
// ─────────────────────────────────────────────────────────────

/** What a two-terminal component does to a DC path passing through it. */
export interface SeriesElement {
  /** Ohms contributed at DC. `0` for an ideal wire/inductor. */
  resistance: number;
  /** Forward voltage dropped at DC (diodes, LEDs). */
  drop: number;
  /** True when the element blocks DC entirely (capacitors). */
  blocksDC: boolean;
  /** True when the element imposes no meaningful impedance at DC. */
  isShort: boolean;
}

/**
 * DC behaviour of a two-terminal component.
 * Returns `null` for components that are not a simple two-terminal series path
 * (transistors, ICs, single-pin symbols).
 */
export function seriesElementOf(component: Component): SeriesElement | null {
  switch (component.type) {
    case ComponentType.Resistor:
      return {
        resistance: component.params.value,
        drop: 0,
        blocksDC: false,
        // A 0 Ω resistor is a wire, and does not limit current.
        isShort: component.params.value === 0,
      };
    case ComponentType.Inductor:
      // An ideal inductor is a short at DC — this is why an inductor is not
      // a substitute for a current-limiting resistor.
      return { resistance: 0, drop: 0, blocksDC: false, isShort: true };
    case ComponentType.Capacitor:
      return { resistance: Infinity, drop: 0, blocksDC: true, isShort: false };
    case ComponentType.Diode:
    case ComponentType.LED:
      // Forward-conducting diode: small dynamic resistance, fixed drop.
      // It does NOT limit current — that is the point of ERC_NO_CURRENT_LIMIT.
      return {
        resistance: 0,
        drop: component.params.value,
        blocksDC: false,
        isShort: true,
      };
    default:
      return null;
  }
}

/** True when the component provides real current limiting at DC. */
export function limitsCurrent(component: Component): boolean {
  const el = seriesElementOf(component);
  if (!el) return false;
  if (el.blocksDC) return true;
  return el.resistance > 0 && Number.isFinite(el.resistance);
}

// ─────────────────────────────────────────────────────────────
// Supply path search
// ─────────────────────────────────────────────────────────────

export interface SupplyPath {
  /** Net where a known potential was found. */
  target: Net;
  /** Potential of that net, in volts. */
  potential: number;
  /** Total series resistance between the start net and the target, in ohms. */
  resistance: number;
  /** Total forward voltage dropped by diodes along the path. */
  drop: number;
  /** Components traversed, in order. */
  path: Component[];
}

/**
 * Which way a path search travels, which decides how diodes are treated.
 *
 * - `downstream` — follow conventional current: enter a diode at its anode.
 * - `upstream`   — trace back towards a source: enter a diode at its cathode.
 * - `either`     — ignore polarity (feedback networks, generic connectivity).
 *
 * Getting this wrong makes a bridge rectifier look like a short circuit.
 */
export type PathDirection = 'downstream' | 'upstream' | 'either';

/** May a path enter `component` at `pin` while travelling `direction`? */
export function canTraverse(
  component: Component,
  pin: Pin,
  direction: PathDirection,
): boolean {
  if (direction === 'either') return true;
  if (component.type !== ComponentType.Diode && component.type !== ComponentType.LED) {
    return true;
  }
  return direction === 'downstream' ? pin.name === 'anode' : pin.name === 'cathode';
}

export interface SupplyPathOptions {
  /** Components that must not be traversed (usually the device under test). */
  exclude?: Set<Component>;
  /** Restrict the search to nets whose potential satisfies this predicate. */
  accept?: (net: Net) => boolean;
  /** Maximum components traversed before giving up. */
  maxDepth?: number;
  /** Travel direction; decides diode polarity. Default `upstream`. */
  direction?: PathDirection;
}

// ─────────────────────────────────────────────────────────────
// Analysis context
// ─────────────────────────────────────────────────────────────

export class ERCContext {
  readonly schematic: Schematic;
  readonly nets: Net[];
  private readonly netById = new Map<string, Net>();
  private readonly netByPin = new Map<Pin, Net>();

  constructor(schematic: Schematic) {
    this.schematic = schematic;
    this.nets = this.buildNets();
    for (const net of this.nets) {
      this.netById.set(net.id, net);
      for (const pin of net.pins) this.netByPin.set(pin, net);
    }
  }

  // ── construction ──────────────────────────────────────────

  private buildNets(): Net[] {
    const pinsByNode = new Map<string, { node: Node; pins: Pin[] }>();

    // Seed from nodes registered on the schematic so that nets with a single
    // pin — or none at all — are still visible to the rules.
    for (const node of this.schematic.nodes) {
      pinsByNode.set(node.id, { node, pins: [] });
    }
    for (const component of this.schematic.components) {
      for (const pin of component.pins) {
        const node = pin.node;
        if (!node) continue;
        let entry = pinsByNode.get(node.id);
        if (!entry) {
          entry = { node, pins: [] };
          pinsByNode.set(node.id, entry);
        }
        entry.pins.push(pin);
      }
    }

    const nets: Net[] = [];
    for (const { node, pins } of pinsByNode.values()) {
      nets.push(this.classifyNet(node, pins));
    }
    return nets;
  }

  private classifyNet(node: Node, pins: Pin[]): Net {
    let isGround = node.isGround();
    let potential: number | undefined;
    let logicLevel: 0 | 1 | undefined;
    let hasSupply = false;
    let isAC = false;

    for (const pin of pins) {
      const comp = this.componentOf(pin);
      if (!comp) continue;
      switch (comp.type) {
        case ComponentType.Ground:
          isGround = true;
          break;
        case ComponentType.PowerRail:
          hasSupply = true;
          if (potential === undefined) potential = comp.params.value;
          break;
        case ComponentType.VoltageSource:
          hasSupply = true;
          if (comp.params.sourceType === 'ac') isAC = true;
          // The IR models a source's negative terminal as its local reference.
          if (pin.name === 'positive' && potential === undefined) {
            potential = comp.params.value;
          } else if (pin.name === 'negative' && potential === undefined) {
            potential = 0;
          }
          break;
        case ComponentType.CurrentSource:
          hasSupply = true;
          break;
        case ComponentType.LogicHigh:
          logicLevel = 1;
          break;
        case ComponentType.LogicLow:
          logicLevel = 0;
          break;
        default:
          break;
      }
    }

    const suppliedPotential = potential;
    if (isGround) potential = 0;

    const kind: NetKind = isGround ? 'ground' : hasSupply ? 'power' : 'signal';

    return {
      id: node.id,
      node,
      name: node.name ?? node.id,
      pins,
      isGround,
      kind,
      potential,
      logicLevel,
      suppliedPotential,
      isAC,
    };
  }

  // ── lookups ───────────────────────────────────────────────

  /** Resolve a pin's owning component within this schematic. */
  componentOf(pin: Pin): Component | null {
    const ref = pin.component;
    return ref instanceof Component ? ref : null;
  }

  netOf(pin: Pin): Net | undefined {
    return this.netByPin.get(pin);
  }

  netOfNode(node: Node): Net | undefined {
    return this.netById.get(node.id);
  }

  /** Every pin in the schematic that is not attached to any node. */
  get unconnectedPins(): Pin[] {
    const out: Pin[] = [];
    for (const component of this.schematic.components) {
      for (const pin of component.pins) {
        if (!pin.isConnected()) out.push(pin);
      }
    }
    return out;
  }

  componentsOfType(...types: ComponentType[]): Component[] {
    const wanted = new Set(types);
    return this.schematic.components.filter(c => wanted.has(c.type));
  }

  componentsIn(set: Set<ComponentType>): Component[] {
    return this.schematic.components.filter(c => set.has(c.type));
  }

  /** Pins on `net` that actively drive it. */
  driversOn(net: Net): Pin[] {
    return net.pins.filter(isDriver);
  }

  /** The nets carrying a ground reference. */
  get groundNets(): Net[] {
    return this.nets.filter(n => n.isGround);
  }

  get hasGround(): boolean {
    return this.groundNets.length > 0 ||
      this.schematic.components.some(c => c.type === ComponentType.Ground);
  }

  /** The other terminals of `pin`'s component (all pins except `pin`). */
  otherPinsOf(pin: Pin): Pin[] {
    const comp = this.componentOf(pin);
    if (!comp) return [];
    return comp.pins.filter(p => p !== pin);
  }

  // ── path queries ──────────────────────────────────────────

  /**
   * Search outward from `start` through two-terminal components for a net with
   * a known potential, returning the lowest-resistance route found.
   *
   * Traversal stops at transistors, ICs and any multi-terminal component: a
   * static rule check cannot know whether such a device conducts.
   */
  findSupplyPath(start: Net, options: SupplyPathOptions = {}): SupplyPath | null {
    const exclude = options.exclude ?? new Set<Component>();
    const accept = options.accept ?? (() => true);
    const maxDepth = options.maxDepth ?? 32;
    // Supply searches trace back towards a source by default.
    const direction = options.direction ?? 'upstream';

    interface Frame {
      net: Net;
      resistance: number;
      drop: number;
      path: Component[];
    }

    let best: SupplyPath | null = null;
    const bestResistanceAtNet = new Map<string, number>();
    const queue: Frame[] = [{ net: start, resistance: 0, drop: 0, path: [] }];
    bestResistanceAtNet.set(start.id, 0);

    while (queue.length > 0) {
      const frame = queue.shift()!;

      // Reaching a net with a known potential ends this branch.
      if (frame.path.length > 0 &&
          frame.net.potential !== undefined &&
          accept(frame.net)) {
        const candidate: SupplyPath = {
          target: frame.net,
          potential: frame.net.potential,
          resistance: frame.resistance,
          drop: frame.drop,
          path: frame.path,
        };
        if (!best || candidate.resistance < best.resistance) best = candidate;
        continue;
      }

      if (frame.path.length >= maxDepth) continue;

      for (const pin of frame.net.pins) {
        const comp = this.componentOf(pin);
        if (!comp || exclude.has(comp) || frame.path.includes(comp)) continue;

        const element = seriesElementOf(comp);
        if (!element || element.blocksDC) continue;
        if (comp.pins.length !== 2) continue;
        if (!canTraverse(comp, pin, direction)) continue;

        const otherPin = comp.pins.find(p => p !== pin);
        const nextNet = otherPin ? this.netOf(otherPin) : undefined;
        if (!nextNet) continue;

        const resistance = frame.resistance + element.resistance;
        const seen = bestResistanceAtNet.get(nextNet.id);
        if (seen !== undefined && seen <= resistance) continue;
        bestResistanceAtNet.set(nextNet.id, resistance);

        queue.push({
          net: nextNet,
          resistance,
          drop: frame.drop + element.drop,
          path: [...frame.path, comp],
        });
      }
    }

    return best;
  }

  /**
   * Nearest net reachable from `start` through two-terminal components that
   * satisfies `predicate`, or `null` if none is.
   *
   * Unlike `findSupplyPath`, the target net needs no known potential — this
   * answers "is there something of this kind out there", which is what
   * driver-reachability questions need. A signal driven through a series
   * resistor is still driven.
   */
  findNetWhere(
    start: Net,
    predicate: (net: Net) => boolean,
    options: { exclude?: Set<Component>; direction?: PathDirection; maxDepth?: number } = {},
  ): Net | null {
    const skip = options.exclude ?? new Set<Component>();
    const direction = options.direction ?? 'either';
    const maxDepth = options.maxDepth ?? 32;

    const visited = new Set<string>([start.id]);
    let frontier: Net[] = [start];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: Net[] = [];
      for (const net of frontier) {
        for (const pin of net.pins) {
          const comp = this.componentOf(pin);
          if (!comp || skip.has(comp)) continue;
          const element = seriesElementOf(comp);
          if (!element || element.blocksDC) continue;
          if (comp.pins.length !== 2) continue;
          if (!canTraverse(comp, pin, direction)) continue;

          const otherPin = comp.pins.find(p => p !== pin);
          const nextNet = otherPin ? this.netOf(otherPin) : undefined;
          if (!nextNet || visited.has(nextNet.id)) continue;
          visited.add(nextNet.id);
          if (predicate(nextNet)) return nextNet;
          next.push(nextNet);
        }
      }
      frontier = next;
    }
    return null;
  }

  /**
   * Lowest-resistance route from `start` to a specific `target` net through
   * two-terminal components.
   *
   * `findSupplyPath` stops at nets whose potential is known; this stops at one
   * named net regardless of its potential, which is what feedback-path and
   * return-path queries need.
   */
  findResistivePath(
    start: Net,
    target: Net,
    exclude?: Set<Component>,
    direction: PathDirection = 'downstream',
  ): { resistance: number; drop: number; path: Component[] } | null {
    if (start.id === target.id) return { resistance: 0, drop: 0, path: [] };
    const skip = exclude ?? new Set<Component>();

    interface Frame { net: Net; resistance: number; drop: number; path: Component[] }
    let best: { resistance: number; drop: number; path: Component[] } | null = null;
    const bestAt = new Map<string, number>([[start.id, 0]]);
    const queue: Frame[] = [{ net: start, resistance: 0, drop: 0, path: [] }];

    while (queue.length > 0) {
      const frame = queue.shift()!;
      if (frame.path.length >= 32) continue;

      for (const pin of frame.net.pins) {
        const comp = this.componentOf(pin);
        if (!comp || skip.has(comp) || frame.path.includes(comp)) continue;
        const element = seriesElementOf(comp);
        if (!element || element.blocksDC) continue;
        if (comp.pins.length !== 2) continue;
        if (!canTraverse(comp, pin, direction)) continue;

        const otherPin = comp.pins.find(p => p !== pin);
        const nextNet = otherPin ? this.netOf(otherPin) : undefined;
        if (!nextNet) continue;

        const resistance = frame.resistance + element.resistance;
        const drop = frame.drop + element.drop;
        const path = [...frame.path, comp];

        if (nextNet.id === target.id) {
          if (!best || resistance < best.resistance) best = { resistance, drop, path };
          continue;
        }
        const seen = bestAt.get(nextNet.id);
        if (seen !== undefined && seen <= resistance) continue;
        bestAt.set(nextNet.id, resistance);
        queue.push({ net: nextNet, resistance, drop, path });
      }
    }
    return best;
  }

  /**
   * Is there any route from `start` to `target` that could carry DC?
   *
   * Unlike `findSupplyPath`, this traverses *through* transistors and ICs.
   * A static check cannot know whether such a device conducts, so this answers
   * "could current ever flow here", not "does it". Used by rules that must not
   * fire when a plausible path exists (e.g. a load switched by a transistor).
   */
  hasConductivePath(
    start: Net,
    target: Net,
    exclude?: Set<Component>,
    direction: PathDirection = 'downstream',
    /** Include DC-blocking elements, to ask "is the loop closed at AC?" */
    includeBlocking = false,
  ): boolean {
    if (start.id === target.id) return true;
    const skip = exclude ?? new Set<Component>();
    const visited = new Set<string>([start.id]);
    const queue: Net[] = [start];

    while (queue.length > 0) {
      const net = queue.shift()!;
      for (const pin of net.pins) {
        const comp = this.componentOf(pin);
        if (!comp || skip.has(comp)) continue;
        // Capacitors are the one element that genuinely blocks DC.
        if (!includeBlocking && seriesElementOf(comp)?.blocksDC) continue;
        if (!canTraverse(comp, pin, direction)) continue;
        for (const other of this.otherPinsOf(pin)) {
          const nextNet = this.netOf(other);
          if (!nextNet) continue;
          if (nextNet.id === target.id) return true;
          if (visited.has(nextNet.id)) continue;
          visited.add(nextNet.id);
          queue.push(nextNet);
        }
      }
    }
    return false;
  }

  /**
   * Lowest-resistance DC route from `start` to any ground net.
   * `null` when no DC return path exists.
   */
  findGroundPath(start: Net, exclude?: Set<Component>): SupplyPath | null {
    if (start.isGround) {
      return { target: start, potential: 0, resistance: 0, drop: 0, path: [] };
    }
    return this.findSupplyPath(start, {
      exclude,
      accept: net => net.isGround,
      direction: 'downstream',   // current flows from the rail towards ground
    });
  }

  /**
   * Lowest-resistance DC route from `start` to a net above ground potential.
   */
  findPowerPath(start: Net, exclude?: Set<Component>): SupplyPath | null {
    return this.findSupplyPath(start, {
      exclude,
      accept: net => net.potential !== undefined && net.potential !== 0,
      direction: 'upstream',
    });
  }
}
