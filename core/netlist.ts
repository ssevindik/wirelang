/**
 * WireScript Core - Netlist Import / Export
 *
 * Supported formats
 * -----------------
 *   'spice'  — SPICE-compatible netlist  (.net / .cir / .sp)
 *   'ws-csv' — WireScript CSV netlist    (.csv)
 *
 * Entry points
 * ------------
 *   exportNetlist(db, options?)     — WireScriptDb → netlist string
 *   importNetlist(src, options?)    — netlist string → WireScriptDb
 *
 *   dbToNetlist / netlistToDb       — aliases (preferred names)
 */

import { type WireScriptDb, type DbComponent, type DbNode, type DbPin } from './db';
import { ComponentType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Supported netlist serialization formats. */
export type NetlistFormat = 'spice' | 'ws-csv';

/** Options for `exportNetlist`. */
export interface NetlistExportOptions {
  /** Output format (default: 'spice'). */
  format?: NetlistFormat;
  /**
   * Title line placed at the top of SPICE output.
   * Defaults to the schematic name.
   */
  title?: string;
  /**
   * Include a SPICE `.end` directive at the bottom (default: true).
   * Ignored for ws-csv format.
   */
  spiceEnd?: boolean;
}

/** Options for `importNetlist`. */
export interface NetlistImportOptions {
  /** Input format (default: auto-detected). */
  format?: NetlistFormat;
  /** Name to assign to the resulting schematic (default: parsed from title or 'imported'). */
  name?: string;
}

/** A single netlist connection entry (pin ↔ node mapping). */
export interface NetlistEntry {
  /** Component reference designator, e.g. 'R1'. */
  refdes: string;
  /** Component type string. */
  type: string;
  /** Pin name on the component. */
  pin: string;
  /** Net / node name the pin is connected to. */
  net: string;
  /** Optional extra fields (e.g. value, model). */
  extras?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPICE type-code mappings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is `token` a SPICE numeric value, rather than a model or part name?
 *
 * Part numbers routinely start with a digit (`2N3819`, `1N4007`), so a
 * first-character test is not enough — the whole token has to parse as a
 * number with at most one SI suffix.
 */
function isSpiceNumericValue(token: string): boolean {
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?(T|G|MEG|K|MIL|M|U|N|P|F)?$/i.test(token.trim());
}

/** Forward voltage assumed for a diode imported by part number alone. */
const DIODE_DEFAULT_VF = 0.7;

/** Open-loop gain assumed for an op-amp imported from a netlist. */
const OPAMP_DEFAULT_GAIN = 100000;

/** Every transistor type, including the legacy generic ones. */
const SPICE_TRANSISTOR_TYPES = new Set<string>([
  ComponentType.NPN, ComponentType.PNP,
  ComponentType.NMOS, ComponentType.PMOS,
  ComponentType.NJFET, ComponentType.PJFET,
  ComponentType.BJT, ComponentType.MOSFET,
]);

/** Maps ComponentType → SPICE reference-designator prefix. */
const SPICE_PREFIX: Record<string, string> = {
  [ComponentType.Resistor]: 'R',
  [ComponentType.Capacitor]: 'C',
  [ComponentType.Inductor]: 'L',
  [ComponentType.Diode]: 'D',
  [ComponentType.LED]: 'D',
  [ComponentType.VoltageSource]: 'V',
  [ComponentType.CurrentSource]: 'I',
  [ComponentType.Ground]: 'X',   // pseudo element
  [ComponentType.PowerRail]: 'X', // pseudo element
  [ComponentType.BJT]: 'Q',
  [ComponentType.NPN]: 'Q',
  [ComponentType.PNP]: 'Q',
  [ComponentType.MOSFET]: 'M',
  [ComponentType.NMOS]: 'M',
  [ComponentType.PMOS]: 'M',
  [ComponentType.NJFET]: 'J',
  [ComponentType.PJFET]: 'J',
  [ComponentType.OpAmp]: 'U',
  [ComponentType.LogicGate]: 'U',
};

/** Maps SPICE prefix → WireScript ComponentType (for import). */
const PREFIX_TO_TYPE: Record<string, string> = {
  R: ComponentType.Resistor,
  C: ComponentType.Capacitor,
  L: ComponentType.Inductor,
  D: ComponentType.Diode,
  Q: ComponentType.NPN,
  M: ComponentType.NMOS,
  J: ComponentType.NJFET,
  V: ComponentType.VoltageSource,
  I: ComponentType.CurrentSource,
  U: ComponentType.OpAmp,
  X: ComponentType.Ground,
};

/**
 * A SPICE element line names its model (`Q1 c b e PNP`). When that model names
 * a channel type, it decides which specific WireScript type the element is.
 */
const MODEL_TO_TYPE: Record<string, string> = {
  NPN: ComponentType.NPN,
  PNP: ComponentType.PNP,
  NMOS: ComponentType.NMOS,
  PMOS: ComponentType.PMOS,
  NJF: ComponentType.NJFET,
  PJF: ComponentType.PJFET,
  NJFET: ComponentType.NJFET,
  PJFET: ComponentType.PJFET,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function spiceRefdes(component: DbComponent, index: number): string {
  const prefix = SPICE_PREFIX[component.type] ?? 'X';
  // Use label if it already starts with the expected prefix
  if (component.label) {
    const upper = component.label.toUpperCase();
    if (upper.startsWith(prefix)) {
      return component.label;
    }
    // Otherwise annotate: prefix + label
    return `${prefix}_${component.label}`;
  }
  return `${prefix}${index + 1}`;
}

/** Terminal order SPICE expects, by WireScript pin name. */
const SPICE_TERMINAL_ORDER: Record<string, string[]> = {
  [ComponentType.NPN]:   ['C', 'B', 'E'],
  [ComponentType.PNP]:   ['C', 'B', 'E'],
  [ComponentType.BJT]:   ['C', 'B', 'E'],
  [ComponentType.NMOS]:  ['D', 'G', 'S'],
  [ComponentType.PMOS]:  ['D', 'G', 'S'],
  [ComponentType.MOSFET]:['D', 'G', 'S'],
  [ComponentType.NJFET]: ['D', 'G', 'S'],
  [ComponentType.PJFET]: ['D', 'G', 'S'],
};

/**
 * Reorder a component's pins into SPICE terminal order.
 * Components with no declared order are emitted as-is.
 */
function orderPinsForSpice(component: DbComponent): DbPin[] {
  const order = SPICE_TERMINAL_ORDER[component.type];
  if (!order) return component.pins;

  const byName = new Map(component.pins.map(p => [p.name, p]));
  const ordered = order
    .map(name => byName.get(name))
    .filter((p): p is DbPin => p !== undefined);

  // Only reorder when every expected terminal is present; otherwise the
  // component is not shaped how we assumed and declaration order is safer.
  if (ordered.length !== order.length) return component.pins;

  // Keep any extra pins (a MOSFET bulk terminal, say) after the known ones.
  const extra = component.pins.filter(p => !order.includes(p.name));
  return [...ordered, ...extra];
}

/**
 * SPICE reference designator for a power rail emitted as a voltage source.
 * Always starts with `V` so simulators parse it as an independent source.
 */
function spiceRailRefdes(component: DbComponent, index: number): string {
  const base = (component.label ?? `RAIL${index + 1}`).replace(/[^A-Za-z0-9_]/g, '_');
  return base.toUpperCase().startsWith('V') ? base : `V${base}`;
}

function spiceNodeName(node: DbNode): string {
  if (node.isGround) {
    return '0'; // SPICE ground is always node 0
  }
  // Sanitize node name for SPICE: replace spaces and special chars with _
  const base = (node.name ?? node.id).replace(/[^A-Za-z0-9_]/g, '_');
  return base || `N${node.id.slice(0, 6)}`;
}

/**
 * Value field for an independent source.
 *
 * A bare number means DC in SPICE, so an AC source written that way silently
 * becomes a DC source on the way back — and a rectifier that depended on the
 * polarity reversing then reads as miswired.
 */
function spiceSourceValue(component: DbComponent): string {
  const params = (component.params ?? {}) as Record<string, unknown>;
  const extras = (component.extras ?? {}) as Record<string, unknown>;
  const magnitude = spiceValue(component);
  const isAC = String(params.sourceType ?? extras.sourceType ?? '').toLowerCase() === 'ac';
  if (!isAC) return magnitude;

  const frequency = extras.frequency ?? params.frequency;
  if (typeof frequency === 'number' && frequency > 0) {
    // Standard transient sine spec: SIN(offset amplitude frequency)
    return `SIN(0 ${magnitude} ${frequency})`;
  }
  return `AC ${magnitude}`;
}

function spiceValue(component: DbComponent): string {
  const value = component.params?.value;
  if (value === undefined || value === null) return '';
  const num = Number(value);
  if (!isFinite(num)) return String(value);
  // Use SI suffixes
  if (Math.abs(num) >= 1e12) return `${(num / 1e12).toPrecision(4)}T`;
  if (Math.abs(num) >= 1e9)  return `${(num / 1e9).toPrecision(4)}G`;
  if (Math.abs(num) >= 1e6)  return `${(num / 1e6).toPrecision(4)}MEG`;
  if (Math.abs(num) >= 1e3)  return `${(num / 1e3).toPrecision(4)}K`;
  if (Math.abs(num) >= 1)    return `${num}`;
  if (Math.abs(num) >= 1e-3) return `${(num * 1e3).toPrecision(4)}M`;
  if (Math.abs(num) >= 1e-6) return `${(num * 1e6).toPrecision(4)}U`;
  if (Math.abs(num) >= 1e-9) return `${(num * 1e9).toPrecision(4)}N`;
  if (Math.abs(num) >= 1e-12)return `${(num * 1e12).toPrecision(4)}P`;
  return `${num}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPICE export
// ─────────────────────────────────────────────────────────────────────────────

function exportSpice(db: WireScriptDb, options: NetlistExportOptions): string {
  const title = options.title ?? db.name ?? 'WireScript Schematic';
  const lines: string[] = [];

  lines.push(`* ${title}`);
  lines.push(`* Generated by WireScript db2netlist`);
  lines.push('');

  // Build node name lookup
  const nodeMap = new Map<string, string>();
  for (const node of db.nodes) {
    nodeMap.set(node.id, spiceNodeName(node));
  }

  // Emit each component
  for (let i = 0; i < db.components.length; i++) {
    const comp = db.components[i];

    // Ground is a net name in SPICE (net 0), not an element.
    if (comp.type === ComponentType.Ground) continue;

    // A power rail IS a supply. Emitting it as a voltage source against net 0
    // is the only faithful SPICE representation — skipping it, as versions
    // before 0.5.0 did, exported a circuit with no power in it.
    if (comp.type === ComponentType.PowerRail) {
      const railNet = comp.pins[0]?.nodeId
        ? nodeMap.get(comp.pins[0].nodeId) ?? 'NC'
        : 'NC';
      if (railNet === 'NC') continue;   // an unconnected rail powers nothing
      const voltage = Number(comp.params?.value ?? 0);
      lines.push(`${spiceRailRefdes(comp, i)} ${railNet} 0 ${voltage}`);
      continue;
    }

    const ref = spiceRefdes(comp, i);
    const isSource = comp.type === ComponentType.VoltageSource ||
                     comp.type === ComponentType.CurrentSource;
    const val = isSource ? spiceSourceValue(comp) : spiceValue(comp);

    // Gather pin node names in SPICE terminal order. WireScript declares a BJT
    // as B,C,E and a FET as G,D,S; SPICE reads Q as C,B,E and M/J as D,G,S.
    // Emitting declaration order would silently swap collector and base.
    const orderedPins = orderPinsForSpice(comp);
    const nets = orderedPins.map(pin => {
      if (!pin.nodeId) return 'NC'; // not connected
      return nodeMap.get(pin.nodeId) ?? 'NC';
    });

    // Build model/value suffix
    const extras = comp.extras ?? {};
    const model = (extras.model ?? extras.partNumber ?? extras.partModel) as string | undefined;

    let suffix = val;
    if (model) {
      suffix = model;
      if (val) suffix = `${model} ; ${val}`;
    }

    // A logic gate's identity is its function, so name it in the model field.
    if (comp.type === ComponentType.LogicGate) {
      const gateType = String((comp.params as Record<string, unknown>).gateType ?? 'GATE');
      const family = String((comp.params as Record<string, unknown>).family ?? '');
      lines.push(`${ref} ${nets.join(' ')} ${gateType}${family ? `_${family}` : ''}`);
      continue;
    }

    // Transistors need a model name in the element line.
    if (SPICE_TRANSISTOR_TYPES.has(comp.type) && !suffix) {
      const transistorType = String((comp.params as Record<string, unknown>).transistorType ?? '');
      suffix = transistorType || 'GENERIC';
    }

    // Op-amp → subcircuit style
    if (comp.type === ComponentType.OpAmp) {
      const partNumber = String(extras.partNumber ?? 'OPAMP');
      lines.push(`${ref} ${nets.join(' ')} ${partNumber}`);
      continue;
    }

    lines.push(`${ref} ${nets.join(' ')} ${suffix}`.trimEnd());
  }

  // Ground and power rail annotations as comments
  const groundNets: string[] = [];
  for (const comp of db.components) {
    if (comp.type === ComponentType.Ground) {
      const pin = comp.pins[0];
      if (pin?.nodeId) {
        const net = nodeMap.get(pin.nodeId) ?? '0';
        groundNets.push(net);
      }
    }
  }
  if (groundNets.length > 0) {
    lines.push('');
    lines.push(`* Ground nets: ${[...new Set(groundNets)].join(', ')}`);
  }

  // Rails round-trip as rails, not as anonymous voltage sources. Simulators
  // ignore comments, so this stays valid SPICE.
  const railNotes: string[] = [];
  for (let i = 0; i < db.components.length; i++) {
    const comp = db.components[i];
    if (comp.type !== ComponentType.PowerRail) continue;
    const nodeId = comp.pins[0]?.nodeId;
    if (!nodeId) continue;
    const net = nodeMap.get(nodeId) ?? 'NC';
    const railName = String((comp.params as Record<string, unknown>).railName ?? comp.label ?? 'VCC');
    railNotes.push(`${spiceRailRefdes(comp, i)}=${railName}@${net}`);
  }
  if (railNotes.length > 0) {
    lines.push(`* Power rails: ${railNotes.join(', ')}`);
  }

  // SPICE prefixes are lossy: D covers both diodes and LEDs, Q says nothing
  // about NPN vs PNP, and U covers every IC. Record the exact WireScript type
  // for each element so import restores what was actually there.
  const deviceNotes: string[] = [];
  for (let i = 0; i < db.components.length; i++) {
    const comp = db.components[i];
    if (comp.type === ComponentType.Ground || comp.type === ComponentType.PowerRail) continue;
    deviceNotes.push(`${spiceRefdes(comp, i)}=${comp.type}`);
  }
  if (deviceNotes.length > 0) {
    lines.push(`* Devices: ${deviceNotes.join(', ')}`);
  }

  lines.push('');
  if (options.spiceEnd !== false) {
    lines.push('.end');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// WireScript CSV export
// Format: refdes,type,pin,net[,value[,model]]
// ─────────────────────────────────────────────────────────────────────────────

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportWsCsv(db: WireScriptDb): string {
  const lines: string[] = [];
  lines.push('refdes,type,pin,net,value,model');

  const nodeMap = new Map<string, string>();
  for (const node of db.nodes) {
    nodeMap.set(node.id, spiceNodeName(node));
  }

  for (let i = 0; i < db.components.length; i++) {
    const comp = db.components[i];
    const ref = spiceRefdes(comp, i);
    const type = comp.type;
    const value = csvEscape(spiceValue(comp));
    const extras = comp.extras ?? {};
    const model = csvEscape(
      String(extras.model ?? extras.partNumber ?? '')
    );

    for (const pin of comp.pins) {
      const net = pin.nodeId ? (nodeMap.get(pin.nodeId) ?? 'NC') : 'NC';
      lines.push([ref, type, pin.name, net, value, model].map(csvEscape).join(','));
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Export entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a `WireScriptDb` to a netlist string.
 *
 * @example
 * const spice = exportNetlist(db);
 * const csv   = exportNetlist(db, { format: 'ws-csv' });
 */
export function exportNetlist(db: WireScriptDb, options: NetlistExportOptions = {}): string {
  const format = options.format ?? 'spice';

  if (format === 'ws-csv') {
    return exportWsCsv(db);
  }

  return exportSpice(db, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// SPICE import
// ─────────────────────────────────────────────────────────────────────────────

function parseSpiceValue(token: string): number {
  if (!token) return 0;
  const t = token.trim().toUpperCase();
  // Longer suffixes must precede shorter ones (MEG before G, MIL before M)
  const suffixes: Array<[string, number]> = [
    ['T', 1e12], ['MEG', 1e6], ['G', 1e9], ['K', 1e3],
    ['MIL', 25.4e-6], ['M', 1e-3], ['U', 1e-6], ['N', 1e-9], ['P', 1e-12], ['F', 1e-15],
  ];
  for (const [suffix, mult] of suffixes) {
    if (t.endsWith(suffix)) {
      const num = parseFloat(t.slice(0, -suffix.length));
      return isNaN(num) ? 0 : num * mult;
    }
  }
  const num = parseFloat(t);
  return isNaN(num) ? 0 : num;
}

interface SpiceElement {
  ref: string;
  type: string;
  nets: string[];
  value: string;
  model?: string;
  /** Set when an annotation identifies this element as a power rail. */
  railName?: string;
  /** `'ac'` when the element declared an AC or SIN() spec. */
  sourceType?: string;
  /** Frequency in Hz, from a SIN() spec. */
  frequency?: number;
}

function parseSpiceLine(line: string): SpiceElement | null {
  // Strip inline comments after ';'
  const clean = line.split(';')[0].trim();
  if (!clean || clean.startsWith('*') || clean.startsWith('.')) return null;

  // Collapse parenthesised specs — `SIN(0 12 60)` is one field, not three.
  const collapsed = clean.replace(/\(([^)]*)\)/g, (_m, inner: string) =>
    `(${inner.trim().split(/[\s,]+/).join(',')})`);

  const tokens = collapsed.split(/\s+/);
  if (tokens.length < 2) return null;

  const ref = tokens[0].toUpperCase();
  const prefix = ref[0];
  const type = PREFIX_TO_TYPE[prefix];
  if (!type) return null;

  // Two-terminal elements have a fixed net count. Transistors and subcircuits
  // vary (a MOSFET may or may not declare a bulk terminal, an op-amp may be 3
  // or 5 pin), so for those the trailing token is the model and everything
  // between is a net.
  const FIXED_NETS: Record<string, number> = { R: 2, C: 2, L: 2, D: 2, V: 2, I: 2, X: 1 };
  // A transistor always has at least three terminals, so a short line is all
  // nets and no model. A subcircuit (U) has no such floor — its terminal count
  // is whatever the line says minus the trailing model name.
  const MIN_NETS: Record<string, number> = { Q: 3, M: 3, J: 3 };

  const available = tokens.length - 1;
  let netCount: number;
  if (FIXED_NETS[prefix] !== undefined) {
    netCount = FIXED_NETS[prefix];
  } else if (prefix === 'U') {
    netCount = available >= 2 ? available - 1 : available;
  } else {
    const min = MIN_NETS[prefix] ?? 2;
    netCount = available > min ? available - 1 : min;
  }

  const nets = tokens.slice(1, 1 + netCount);
  const remaining = tokens.slice(1 + netCount);
  const value = remaining[0] ?? '';
  const model = remaining[1];

  // `Q1 c b e PNP` — a model naming the channel type pins down which specific
  // WireScript type this is, rather than defaulting to the N-type variant.
  const declared = MODEL_TO_TYPE[(value || '').toUpperCase()];
  const resolvedType = declared ?? type;

  const element: SpiceElement = { ref, type: resolvedType, nets, value, model };

  // Decode an AC source spec back into sourceType + frequency.
  const sine = /^SIN\(([^)]*)\)$/i.exec(value);
  if (sine) {
    const [, amplitude, frequency] = sine[1].split(',');
    element.sourceType = 'ac';
    element.value = amplitude ?? '0';
    if (frequency) element.frequency = parseSpiceValue(frequency);
  } else if (value.toUpperCase() === 'AC') {
    element.sourceType = 'ac';
    element.value = model ?? '0';
    element.model = undefined;
  } else if (value.toUpperCase() === 'DC') {
    element.value = model ?? '0';
    element.model = undefined;
  }

  return element;
}

function buildDbFromElements(elements: SpiceElement[], name: string): WireScriptDb {
  const netNames = new Set<string>();
  for (const el of elements) {
    el.nets.forEach(n => netNames.add(n));
  }

  // Build nodes
  let nodeIdx = 1;
  const netToNodeId = new Map<string, string>();
  const nodes: DbNode[] = [];

  for (const net of netNames) {
    const isGround = net === '0' || net.toLowerCase() === 'gnd';
    const nodeId = isGround ? 'node_gnd' : `node_${nodeIdx++}`;
    netToNodeId.set(net, nodeId);
    // Only push each nodeId once
    if (!nodes.find(n => n.id === nodeId)) {
      nodes.push({ id: nodeId, name: isGround ? 'GND' : net, isGround });
    }
  }

  // Build components
  let compIdx = 1;
  let pinIdx = 1;
  const components: DbComponent[] = [];

  for (const el of elements) {
    const compId = `comp_${el.ref.toLowerCase()}_${compIdx++}`;
    const numVal = parseSpiceValue(el.value);

    // A power rail is a single-pin symbol: it was written as a two-terminal
    // source against net 0, but only the rail net belongs to the component.
    if (el.type === ComponentType.PowerRail) {
      const railNet = el.nets[0];
      const nodeId = railNet ? netToNodeId.get(railNet) : undefined;
      components.push({
        id: compId,
        type: ComponentType.PowerRail,
        // The refdes is unique (VCC1, VCC2); the rail *name* is shared by every
        // rail at the same potential and belongs in params, not the label.
        label: el.ref,
        params: {
          value: numVal,
          unit: 'V',
          railName: el.railName ?? 'VCC',
        } as import('./types').ComponentParams,
        pins: [{ id: `pin_${pinIdx++}`, name: 'out', nodeId: nodeId ?? undefined }],
      });
      continue;
    }

    // Build pins
    const extrasSeed: Record<string, unknown> = {};
    const pinNames = getSpicePinNames(el.type, el.nets.length);
    const pins: DbPin[] = el.nets.map((net, i) => {
      const nodeId = netToNodeId.get(net);
      return {
        id: `pin_${pinIdx++}`,
        name: pinNames[i] ?? String(i + 1),
        nodeId: nodeId ?? undefined,
      };
    });

    const params = { value: numVal, unit: inferUnit(el.type) };

    // A logic gate's model field is `AND_74HC` — split it back apart.
    if (el.type === ComponentType.LogicGate) {
      const spec = el.value || el.model || 'NOT';
      const [gateType, ...familyParts] = spec.split('_');
      (params as Record<string, unknown>).gateType = gateType.toUpperCase();
      if (familyParts.length > 0) {
        (params as Record<string, unknown>).family = familyParts.join('_');
      }
      params.value = Math.max(1, el.nets.length - 1);   // input count
      params.unit = 'inputs';
    }

    // Carry the decoded source spec into the DB.
    if (el.sourceType) {
      (params as Record<string, unknown>).sourceType = el.sourceType;
      if (el.frequency !== undefined) extrasSeed.frequency = el.frequency;
    }

    // An op-amp element line carries its part number where other elements
    // carry a value (`U1 … LM741`). Keep the part number and let the open-loop
    // gain fall back to the component default rather than parsing to 0.
    if (el.type === ComponentType.OpAmp) {
      const partNumber = el.model ?? (el.value && !isSpiceNumericValue(el.value) ? el.value : undefined);
      if (partNumber) (params as Record<string, unknown>).partNumber = partNumber;
      params.value = OPAMP_DEFAULT_GAIN;
      params.unit = 'V/V';
    }

    // Extras
    const extras: Record<string, unknown> = { ...extrasSeed };

    // `Q1 c b e 2N2222`, `D1 a c 1N4148` — the trailing token names the part,
    // where other elements carry a numeric value. Keep it, and leave the
    // electrical parameters to that part's defaults.
    const namesAPart = el.value && !isSpiceNumericValue(el.value);

    if (SPICE_TRANSISTOR_TYPES.has(el.type) && namesAPart) {
      extras.model = el.value;
      params.value = 0;   // placeholder: dbToSchematic defers to the model
    }

    if ((el.type === ComponentType.Diode || el.type === ComponentType.LED) && namesAPart) {
      extras.partNumber = el.value;
      // The forward voltage rides along in the trailing `; <Vf>` comment, which
      // the parser strips, so fall back to the silicon default.
      params.value = DIODE_DEFAULT_VF;
    }
    if (el.model && el.model !== el.value) {
      extras.model = el.model;
    }
    const TRANSISTOR_VARIANT: Record<string, string> = {
      [ComponentType.NPN]: 'NPN',
      [ComponentType.PNP]: 'PNP',
      [ComponentType.NMOS]: 'NMOS',
      [ComponentType.PMOS]: 'PMOS',
      [ComponentType.NJFET]: 'NJFET',
      [ComponentType.PJFET]: 'PJFET',
      [ComponentType.BJT]: 'NPN',
      [ComponentType.MOSFET]: 'NMOS',
    };
    if (TRANSISTOR_VARIANT[el.type]) {
      (params as Record<string, unknown>).transistorType = TRANSISTOR_VARIANT[el.type];
    }

    components.push({
      id: compId,
      type: el.type,
      label: el.ref,
      params: params as import('./types').ComponentParams,
      pins,
      ...(Object.keys(extras).length > 0 ? { extras } : {}),
    });
  }

  // SPICE writes ground as net 0 with no symbol of its own. Re-materialise a
  // Ground component so the imported circuit carries an explicit 0V reference
  // — without it, ERC on a round-tripped netlist reports ERC_NO_GROUND.
  const groundNode = nodes.find(n => n.isGround);
  if (groundNode && !components.some(c => c.type === ComponentType.Ground)) {
    components.push({
      id: `comp_gnd_${compIdx++}`,
      type: ComponentType.Ground,
      label: 'GND1',
      params: { value: 0, unit: 'V' },
      pins: [{ id: `pin_${pinIdx++}`, name: 'gnd', nodeId: groundNode.id }],
    });
  }

  return {
    schema: 'wirescript-db@v1',
    name,
    components,
    nodes,
  };
}

function getSpicePinNames(type: string, count: number): string[] {
  switch (type) {
    case ComponentType.Resistor:
    case ComponentType.Capacitor:
    case ComponentType.Inductor:
      return ['1', '2'];
    case ComponentType.Diode:
    case ComponentType.LED:
      return ['anode', 'cathode'];
    case ComponentType.VoltageSource:
    case ComponentType.CurrentSource:
      return ['positive', 'negative'];
    // These must be WireScript's own pin names, in SPICE terminal order —
    // dbToSchematic() looks pins up by name, so 'collector' would not resolve.
    case ComponentType.BJT:
    case ComponentType.NPN:
    case ComponentType.PNP:
      return ['C', 'B', 'E'];
    case ComponentType.MOSFET:
    case ComponentType.NMOS:
    case ComponentType.PMOS:
    case ComponentType.NJFET:
    case ComponentType.PJFET:
      return ['D', 'G', 'S', 'bulk'].slice(0, count);
    case ComponentType.OpAmp:
      return ['inP', 'inN', 'out', 'vPos', 'vNeg'].slice(0, count);
    case ComponentType.LogicGate:
      // A 1-input gate is an inverter/buffer: A, Y. Otherwise A, B, …, Y.
      return count <= 2
        ? ['A', 'Y'].slice(0, count)
        : [...['A', 'B', 'C', 'D'].slice(0, count - 1), 'Y'];
    case ComponentType.LogicHigh:
    case ComponentType.LogicLow:
    case ComponentType.Clock:
    case ComponentType.PowerRail:
      return ['out'];
    case ComponentType.Ground:
      return ['gnd'];
    default:
      return Array.from({ length: count }, (_, i) => String(i + 1));
  }
}

function inferUnit(type: string): string {
  switch (type) {
    case ComponentType.Resistor:   return 'Ω';
    case ComponentType.Capacitor:  return 'F';
    case ComponentType.Inductor:   return 'H';
    case ComponentType.VoltageSource: return 'V';
    case ComponentType.CurrentSource: return 'A';
    default: return '';
  }
}

/**
 * Annotations WireScript writes as SPICE comments so that information with no
 * SPICE representation survives a round-trip. Simulators ignore these lines.
 */
interface SpiceAnnotations {
  /** refdes → rail name, for `V…` elements that were really a PowerRail. */
  rails: Map<string, string>;
  /** refdes → exact WireScript component type. */
  devices: Map<string, string>;
}

function parseAnnotations(lines: string[]): SpiceAnnotations {
  const rails = new Map<string, string>();
  const devices = new Map<string, string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('*')) continue;
    const body = line.slice(1).trim();

    const railMatch = /^Power rails:\s*(.+)$/i.exec(body);
    if (railMatch) {
      for (const entry of railMatch[1].split(',')) {
        // `VCC1=VCC@node_3`
        const m = /^\s*([^=]+)=([^@]+)(?:@(.*))?\s*$/.exec(entry);
        if (m) rails.set(m[1].trim().toUpperCase(), m[2].trim());
      }
      continue;
    }

    const deviceMatch = /^Devices:\s*(.+)$/i.exec(body);
    if (deviceMatch) {
      for (const entry of deviceMatch[1].split(',')) {
        const m = /^\s*([^=]+)=(.+?)\s*$/.exec(entry);
        if (m) devices.set(m[1].trim().toUpperCase(), m[2].trim());
      }
    }
  }

  return { rails, devices };
}

function importSpice(src: string, options: NetlistImportOptions): WireScriptDb {
  const lines = src.split('\n');
  const elements: SpiceElement[] = [];

  // Extract title from first line (if it's a comment starting with *)
  let parsedTitle = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('*')) {
      const candidate = trimmed.slice(1).trim();
      if (candidate && !candidate.toLowerCase().startsWith('generated')) {
        parsedTitle = candidate;
        break;
      }
    }
  }

  const annotations = parseAnnotations(lines);

  for (const line of lines) {
    const el = parseSpiceLine(line);
    if (!el) continue;

    // A voltage source WireScript wrote for a PowerRail becomes a rail again.
    const railName = annotations.rails.get(el.ref);
    if (railName && el.type === ComponentType.VoltageSource) {
      el.type = ComponentType.PowerRail;
      el.railName = railName;
    }

    // An exact device type recorded on export beats what the prefix implies.
    const declaredType = annotations.devices.get(el.ref);
    if (declaredType) el.type = declaredType;

    elements.push(el);
  }

  const name = options.name ?? (parsedTitle || 'imported');
  return buildDbFromElements(elements, name);
}

// ─────────────────────────────────────────────────────────────────────────────
// WireScript CSV import
// ─────────────────────────────────────────────────────────────────────────────

function parseWsCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function importWsCsv(src: string, options: NetlistImportOptions): WireScriptDb {
  const lines = src.split('\n').filter(l => l.trim());
  if (lines.length === 0) {
    throw new Error('Empty CSV netlist');
  }

  // Parse header
  const header = parseWsCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const iRefdes = col('refdes');
  const iType   = col('type');
  const iPin    = col('pin');
  const iNet    = col('net');
  const iValue  = col('value');
  const iModel  = col('model');

  if (iRefdes < 0 || iType < 0 || iPin < 0 || iNet < 0) {
    throw new Error('CSV netlist must have columns: refdes,type,pin,net');
  }

  // Aggregate rows by refdes
  const compMap = new Map<string, {
    refdes: string; type: string; value: string; model: string;
    pins: Array<{ pin: string; net: string }>;
  }>();

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseWsCsvLine(line);
    const refdes = (cols[iRefdes] ?? '').trim();
    const type   = (cols[iType]   ?? '').trim();
    const pin    = (cols[iPin]    ?? '').trim();
    const net    = (cols[iNet]    ?? '').trim();
    const value  = iValue >= 0 ? (cols[iValue] ?? '').trim() : '';
    const model  = iModel >= 0 ? (cols[iModel] ?? '').trim() : '';

    if (!refdes || !type || !pin) continue;

    if (!compMap.has(refdes)) {
      compMap.set(refdes, { refdes, type, value, model, pins: [] });
    }
    compMap.get(refdes)!.pins.push({ pin, net });
  }

  // Build net → node lookup
  const netNames = new Set<string>();
  for (const comp of compMap.values()) {
    comp.pins.forEach(p => netNames.add(p.net));
  }

  let nodeIdx = 1;
  const netToNodeId = new Map<string, string>();
  const nodes: DbNode[] = [];

  for (const net of netNames) {
    if (!net || net === 'NC') continue;
    const isGround = net === '0' || net.toLowerCase() === 'gnd';
    const nodeId = isGround ? 'node_gnd' : `node_${nodeIdx++}`;
    netToNodeId.set(net, nodeId);
    if (!nodes.find(n => n.id === nodeId)) {
      nodes.push({ id: nodeId, name: isGround ? 'GND' : net, isGround });
    }
  }

  // Build components
  let compIdx = 1;
  let pinIdx = 1;
  const components: DbComponent[] = [];

  for (const entry of compMap.values()) {
    const compId = `comp_${entry.refdes.toLowerCase()}_${compIdx++}`;
    const numVal = parseSpiceValue(entry.value);
    const params = { value: numVal, unit: inferUnit(entry.type) };
    const extras: Record<string, unknown> = {};
    if (entry.model) extras.model = entry.model;

    const pins: DbPin[] = entry.pins.map(p => ({
      id: `pin_${pinIdx++}`,
      name: p.pin,
      nodeId: p.net && p.net !== 'NC' ? (netToNodeId.get(p.net) ?? undefined) : undefined,
    }));

    components.push({
      id: compId,
      type: entry.type,
      label: entry.refdes,
      params: params as import('./types').ComponentParams,
      pins,
      ...(Object.keys(extras).length > 0 ? { extras } : {}),
    });
  }

  return {
    schema: 'wirescript-db@v1',
    name: options.name ?? 'imported',
    components,
    nodes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect format
// ─────────────────────────────────────────────────────────────────────────────

function detectFormat(src: string): NetlistFormat {
  const trimmed = src.trim();
  // CSV: first line looks like a header with commas and 'refdes'
  if (/^refdes[,]/i.test(trimmed)) return 'ws-csv';
  return 'spice';
}

// ─────────────────────────────────────────────────────────────────────────────
// Import entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a netlist string and return a `WireScriptDb`.
 *
 * @example
 * const db = importNetlist(spiceText);
 * const db2 = importNetlist(csvText, { format: 'ws-csv' });
 */
export function importNetlist(src: string, options: NetlistImportOptions = {}): WireScriptDb {
  const format = options.format ?? detectFormat(src);

  if (format === 'ws-csv') {
    return importWsCsv(src, options);
  }

  return importSpice(src, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aliases (preferred API names)
// ─────────────────────────────────────────────────────────────────────────────

/** Alias: `WireScriptDb` → netlist string */
export const dbToNetlist = exportNetlist;

/** Alias: netlist string → `WireScriptDb` */
export const netlistToDb = importNetlist;

/** Alias: `WireScriptDb` → SPICE netlist */
export const db2netlist = exportNetlist;

/** Alias: netlist string → `WireScriptDb` */
export const netlist2db = importNetlist;
