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
  [ComponentType.OpAmp]: 'U',
  [ComponentType.LogicGate]: 'U',
};

/** Maps SPICE prefix → WireScript ComponentType (for import). */
const PREFIX_TO_TYPE: Record<string, string> = {
  R: ComponentType.Resistor,
  C: ComponentType.Capacitor,
  L: ComponentType.Inductor,
  D: ComponentType.Diode,
  Q: ComponentType.BJT,
  M: ComponentType.MOSFET,
  V: ComponentType.VoltageSource,
  I: ComponentType.CurrentSource,
  U: ComponentType.OpAmp,
  X: ComponentType.Ground,
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

function spiceNodeName(node: DbNode): string {
  if (node.isGround) {
    return '0'; // SPICE ground is always node 0
  }
  // Sanitize node name for SPICE: replace spaces and special chars with _
  const base = (node.name ?? node.id).replace(/[^A-Za-z0-9_]/g, '_');
  return base || `N${node.id.slice(0, 6)}`;
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
    // Skip pure ground / power-rail pseudo-components in SPICE
    // (they are represented by node names, not elements)
    if (comp.type === ComponentType.Ground || comp.type === ComponentType.PowerRail) {
      continue;
    }

    const ref = spiceRefdes(comp, i);
    const val = spiceValue(comp);

    // Gather pin node names in pin order
    const nets = comp.pins.map(pin => {
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

    // BJT / MOSFET need model name
    if ((comp.type === ComponentType.BJT || comp.type === ComponentType.NPN ||
         comp.type === ComponentType.PNP || comp.type === ComponentType.MOSFET ||
         comp.type === ComponentType.NMOS || comp.type === ComponentType.PMOS) && !suffix) {
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
}

function parseSpiceLine(line: string): SpiceElement | null {
  // Strip inline comments after ';'
  const clean = line.split(';')[0].trim();
  if (!clean || clean.startsWith('*') || clean.startsWith('.')) return null;

  const tokens = clean.split(/\s+/);
  if (tokens.length < 2) return null;

  const ref = tokens[0].toUpperCase();
  const prefix = ref[0];
  const type = PREFIX_TO_TYPE[prefix];
  if (!type) return null;

  // Determine how many net tokens come before the value/model
  // SPICE convention: R,C,L,V,I → 2 nets; Q → 3 nets; M → 4 nets; D → 2 nets
  const netCounts: Record<string, number> = {
    R: 2, C: 2, L: 2, D: 2, V: 2, I: 2, Q: 3, M: 4, U: 3, X: 1,
  };
  const netCount = netCounts[prefix] ?? 2;
  const nets = tokens.slice(1, 1 + netCount);
  const remaining = tokens.slice(1 + netCount);
  const value = remaining[0] ?? '';
  const model = remaining[1];

  return { ref, type, nets, value, model };
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

    // Build pins
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

    // Extras
    const extras: Record<string, unknown> = {};
    if (el.model && el.model !== el.value) {
      extras.model = el.model;
    }
    if (el.type === ComponentType.NPN || el.type === ComponentType.BJT) {
      (params as Record<string, unknown>).transistorType = 'NPN';
    }
    if (el.type === ComponentType.PNP) {
      (params as Record<string, unknown>).transistorType = 'PNP';
    }
    if (el.type === ComponentType.NMOS || el.type === ComponentType.MOSFET) {
      (params as Record<string, unknown>).transistorType = 'NMOS';
    }
    if (el.type === ComponentType.PMOS) {
      (params as Record<string, unknown>).transistorType = 'PMOS';
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
    case ComponentType.BJT:
    case ComponentType.NPN:
    case ComponentType.PNP:
      return ['collector', 'base', 'emitter'];
    case ComponentType.MOSFET:
    case ComponentType.NMOS:
    case ComponentType.PMOS:
      return ['drain', 'gate', 'source', 'bulk'].slice(0, count);
    case ComponentType.OpAmp:
      return ['out', 'in+', 'in-'].slice(0, count);
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

  for (const line of lines) {
    const el = parseSpiceLine(line);
    if (el) elements.push(el);
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
