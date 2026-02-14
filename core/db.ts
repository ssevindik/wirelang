/**
 * WireLang Core - DB schema and DSL<->DB transforms
 */

import { Component } from './Component';
import { Node } from './Node';
import { Pin } from './Pin';
import { Schematic } from './Schematic';
import { ComponentParams, ComponentType, PinDirection, SourceType } from './types';

export interface WireLangDb {
  schema: 'wirelang-db@v1';
  name: string;
  components: DbComponent[];
  nodes: DbNode[];
  meta?: Record<string, unknown>;
}

export interface DbComponent {
  id: string;
  type: string;
  label?: string;
  params: ComponentParams;
  pins: DbPin[];
  extras?: Record<string, unknown>;
}

export interface DbPin {
  id: string;
  name: string;
  direction?: PinDirection;
  nodeId?: string;
}

export interface DbNode {
  id: string;
  name?: string;
  isGround?: boolean;
}

export interface DbToDslOptions {
  moduleImport?: string;
  exportName?: string;
  preserveIds?: boolean;
}

const DB_SCHEMA = 'wirelang-db@v1';

function extractExtras(component: Component): Record<string, unknown> | undefined {
  const baseKeys = new Set(['id', 'type', 'pins', 'params', 'label']);
  const extras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(component as unknown as Record<string, unknown>)) {
    if (baseKeys.has(key)) {
      continue;
    }
    extras[key] = value;
  }

  return Object.keys(extras).length > 0 ? extras : undefined;
}

export function compileDslToDb(schematic: Schematic): WireLangDb {
  const nodes: DbNode[] = schematic.nodes.map((node: Node) => ({
    id: node.id,
    name: node.name,
    isGround: node.isGround(),
  }));

  const components: DbComponent[] = schematic.components.map((component: Component) => {
    const pins: DbPin[] = component.pins.map((pin: Pin) => ({
      id: pin.id,
      name: pin.name,
      direction: pin.direction,
      nodeId: pin.node?.id,
    }));

    return {
      id: component.id,
      type: component.type,
      label: component.label,
      params: { ...component.params },
      pins,
      extras: extractExtras(component),
    };
  });

  return {
    schema: DB_SCHEMA,
    name: schematic.name,
    components,
    nodes,
  };
}

function toLiteral(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value);
}

function toObjectLiteral(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return '{}';
  }
  return `{ ${entries.map(([key, value]) => `${key}: ${toLiteral(value)}`).join(', ')} }`;
}

function toSafeIdentifier(raw: string, fallback: string, used: Set<string>): string {
  const sanitized = raw.replace(/[^A-Za-z0-9_]/g, '_');
  let name = sanitized.length > 0 ? sanitized : fallback;

  if (/^[0-9]/.test(name)) {
    name = `${fallback}_${name}`;
  }

  const reserved = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
    'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function',
    'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch',
    'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  ]);

  if (reserved.has(name)) {
    name = `${name}_`;
  }

  let candidate = name;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${name}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildComponentExpression(component: DbComponent): { expression: string; imports: string[] } {
  const params = component.params ?? { value: 0, unit: '' };
  const extras = component.extras ?? {};
  const imports = new Set<string>();

  switch (component.type) {
    case ComponentType.Resistor: {
      imports.add('R');
      return { expression: `R(${toLiteral(params.value)})`, imports: Array.from(imports) };
    }
    case ComponentType.Capacitor: {
      imports.add('C');
      return { expression: `C(${toLiteral(params.value)})`, imports: Array.from(imports) };
    }
    case ComponentType.Inductor: {
      imports.add('L');
      return { expression: `L(${toLiteral(params.value)})`, imports: Array.from(imports) };
    }
    case ComponentType.Diode: {
      imports.add('D');
      const diodeParams: Record<string, unknown> = {};
      if (extras.forwardVoltage !== undefined) {
        diodeParams.forwardVoltage = extras.forwardVoltage;
      } else if (params.value !== undefined) {
        diodeParams.forwardVoltage = params.value;
      }
      if (extras.maxCurrent !== undefined) {
        diodeParams.maxCurrent = extras.maxCurrent;
      }
      if (extras.partNumber !== undefined) {
        diodeParams.partNumber = extras.partNumber;
      }

      if (diodeParams.partNumber !== undefined && Object.keys(diodeParams).length === 1) {
        return { expression: `D(${toLiteral(diodeParams.partNumber)})`, imports: Array.from(imports) };
      }
      return { expression: `D(${toObjectLiteral(diodeParams)})`, imports: Array.from(imports) };
    }
    case ComponentType.LED: {
      imports.add('LED');
      const ledParams: Record<string, unknown> = {};
      if (params.color !== undefined) {
        ledParams.color = params.color;
      }
      if (extras.forwardVoltage !== undefined) {
        ledParams.forwardVoltage = extras.forwardVoltage;
      } else if (params.value !== undefined) {
        ledParams.forwardVoltage = params.value;
      }
      if (extras.maxCurrent !== undefined) {
        ledParams.maxCurrent = extras.maxCurrent;
      }
      const keys = Object.keys(ledParams);
      if (keys.length === 1 && keys[0] === 'color') {
        return { expression: `LED(${toLiteral(ledParams.color)})`, imports: Array.from(imports) };
      }
      return { expression: `LED(${toObjectLiteral(ledParams)})`, imports: Array.from(imports) };
    }
    case ComponentType.VoltageSource: {
      const sourceType = (params as Record<string, unknown>).sourceType ?? (extras as Record<string, unknown>).sourceType;
      const voltage = params.value;
      const frequency = (extras as Record<string, unknown>).frequency;
      if (sourceType === SourceType.AC || sourceType === 'ac') {
        if (typeof frequency === 'number') {
          imports.add('AC');
          return { expression: `AC(${toLiteral(voltage)}, ${toLiteral(frequency)})`, imports: Array.from(imports) };
        }
        imports.add('VoltageSource');
        imports.add('SourceType');
        return {
          expression: `new VoltageSource({ voltage: ${toLiteral(voltage)}, sourceType: SourceType.AC })`,
          imports: Array.from(imports),
        };
      }
      imports.add('DC');
      return { expression: `DC(${toLiteral(voltage)})`, imports: Array.from(imports) };
    }
    case ComponentType.CurrentSource: {
      const sourceType = (params as Record<string, unknown>).sourceType ?? (extras as Record<string, unknown>).sourceType;
      const current = params.value;
      const frequency = (extras as Record<string, unknown>).frequency;
      if (sourceType === SourceType.AC || sourceType === 'ac') {
        if (typeof frequency === 'number') {
          imports.add('IAC');
          return { expression: `IAC(${toLiteral(current)}, ${toLiteral(frequency)})`, imports: Array.from(imports) };
        }
        imports.add('CurrentSource');
        imports.add('SourceType');
        return {
          expression: `new CurrentSource({ current: ${toLiteral(current)}, sourceType: SourceType.AC })`,
          imports: Array.from(imports),
        };
      }
      imports.add('IDC');
      return { expression: `IDC(${toLiteral(current)})`, imports: Array.from(imports) };
    }
    case ComponentType.Ground: {
      imports.add('GND');
      return { expression: 'GND()', imports: Array.from(imports) };
    }
    case ComponentType.PowerRail: {
      const railName = (params as Record<string, unknown>).railName;
      const voltage = params.value;
      if (railName === 'VCC') {
        imports.add('VCC');
        return { expression: `VCC(${toLiteral(voltage)})`, imports: Array.from(imports) };
      }
      if (railName === 'VDD') {
        imports.add('VDD');
        return { expression: `VDD(${toLiteral(voltage)})`, imports: Array.from(imports) };
      }
      if (railName === 'V+') {
        imports.add('VPOS');
        return { expression: `VPOS(${toLiteral(voltage)})`, imports: Array.from(imports) };
      }
      if (railName === 'V-') {
        imports.add('VNEG');
        return { expression: `VNEG(${toLiteral(voltage)})`, imports: Array.from(imports) };
      }
      imports.add('PowerRail');
      return { expression: `new PowerRail(${toLiteral(voltage)}, ${toLiteral(railName)})`, imports: Array.from(imports) };
    }
    case ComponentType.BJT: {
      const transistorType = (params as Record<string, unknown>).transistorType;
      const model = (extras as Record<string, unknown>).model ?? (params as Record<string, unknown>).model;
      const bjtParams: Record<string, unknown> = {};
      if (model !== undefined) bjtParams.model = model;
      if (extras.hfe !== undefined) bjtParams.hfe = extras.hfe;
      if (extras.vce_sat !== undefined) bjtParams.vce_sat = extras.vce_sat;
      if (extras.vbe !== undefined) bjtParams.vbe = extras.vbe;

      if (transistorType === 'PNP') {
        imports.add('PNP');
        if (Object.keys(bjtParams).length === 0) {
          return { expression: 'PNP()', imports: Array.from(imports) };
        }
        if (Object.keys(bjtParams).length === 1 && bjtParams.model !== undefined) {
          return { expression: `PNP(${toLiteral(bjtParams.model)})`, imports: Array.from(imports) };
        }
        return { expression: `PNP(${toObjectLiteral(bjtParams)})`, imports: Array.from(imports) };
      }
      imports.add('NPN');
      if (Object.keys(bjtParams).length === 0) {
        return { expression: 'NPN()', imports: Array.from(imports) };
      }
      if (Object.keys(bjtParams).length === 1 && bjtParams.model !== undefined) {
        return { expression: `NPN(${toLiteral(bjtParams.model)})`, imports: Array.from(imports) };
      }
      return { expression: `NPN(${toObjectLiteral(bjtParams)})`, imports: Array.from(imports) };
    }
    case ComponentType.MOSFET: {
      const transistorType = (params as Record<string, unknown>).transistorType;
      const model = (extras as Record<string, unknown>).model ?? (params as Record<string, unknown>).model;
      const fetParams: Record<string, unknown> = {};
      if (model !== undefined) fetParams.model = model;
      if (extras.vth !== undefined) fetParams.vth = extras.vth;
      if (extras.rds_on !== undefined) fetParams.rds_on = extras.rds_on;
      if (extras.id_max !== undefined) fetParams.id_max = extras.id_max;

      if (transistorType === 'PMOS') {
        imports.add('PMOS');
        if (Object.keys(fetParams).length === 0) {
          return { expression: 'PMOS()', imports: Array.from(imports) };
        }
        if (Object.keys(fetParams).length === 1 && fetParams.model !== undefined) {
          return { expression: `PMOS(${toLiteral(fetParams.model)})`, imports: Array.from(imports) };
        }
        return { expression: `PMOS(${toObjectLiteral(fetParams)})`, imports: Array.from(imports) };
      }
      imports.add('NMOS');
      if (Object.keys(fetParams).length === 0) {
        return { expression: 'NMOS()', imports: Array.from(imports) };
      }
      if (Object.keys(fetParams).length === 1 && fetParams.model !== undefined) {
        return { expression: `NMOS(${toLiteral(fetParams.model)})`, imports: Array.from(imports) };
      }
      return { expression: `NMOS(${toObjectLiteral(fetParams)})`, imports: Array.from(imports) };
    }
    case ComponentType.OpAmp: {
      const partNumber = (extras as Record<string, unknown>).partNumber ?? (params as Record<string, unknown>).partNumber;
      const gain = (extras as Record<string, unknown>).gain;
      const isThreePin = component.pins.length === 3;
      if (gain !== undefined || partNumber !== undefined) {
        const opAmpParams: Record<string, unknown> = {};
        if (partNumber !== undefined) opAmpParams.partNumber = partNumber;
        if (gain !== undefined) opAmpParams.gain = gain;
        if (gain !== undefined) {
          imports.add(isThreePin ? 'OpAmp3Component' : 'OpAmpComponent');
          const ctor = isThreePin ? 'OpAmp3Component' : 'OpAmpComponent';
          return { expression: `new ${ctor}(${toObjectLiteral(opAmpParams)})`, imports: Array.from(imports) };
        }
        imports.add(isThreePin ? 'OpAmp3' : 'OpAmp');
        const factory = isThreePin ? 'OpAmp3' : 'OpAmp';
        return { expression: `${factory}(${toLiteral(partNumber)})`, imports: Array.from(imports) };
      }
      imports.add(isThreePin ? 'OpAmp3' : 'OpAmp');
      const factory = isThreePin ? 'OpAmp3' : 'OpAmp';
      return { expression: `${factory}()`, imports: Array.from(imports) };
    }
    case ComponentType.LogicGate: {
      const gateType = (params as Record<string, unknown>).gateType;
      const family = (params as Record<string, unknown>).family;
      const gateMap: Record<string, string> = {
        NOT: 'NOT',
        AND: 'AND',
        OR: 'OR',
        XOR: 'XOR',
        NAND: 'NAND',
        NOR: 'NOR',
      };
      const factory = typeof gateType === 'string' ? gateMap[gateType] : undefined;
      if (!factory) {
        throw new Error(`Unsupported logic gate type: ${String(gateType)}`);
      }
      imports.add(factory);
      if (family !== undefined) {
        return { expression: `${factory}(${toLiteral(family)})`, imports: Array.from(imports) };
      }
      return { expression: `${factory}()`, imports: Array.from(imports) };
    }
    case 'logic_high': {
      imports.add('HIGH');
      return { expression: 'HIGH()', imports: Array.from(imports) };
    }
    case 'logic_low': {
      imports.add('LOW');
      return { expression: 'LOW()', imports: Array.from(imports) };
    }
    case 'clock': {
      imports.add('CLK');
      const frequency = params.value;
      const dutyCycle = (params as Record<string, unknown>).dutyCycle ?? (extras as Record<string, unknown>).dutyCycle;
      if (dutyCycle !== undefined) {
        return { expression: `CLK(${toLiteral(frequency)}, ${toLiteral(dutyCycle)})`, imports: Array.from(imports) };
      }
      return { expression: `CLK(${toLiteral(frequency)})`, imports: Array.from(imports) };
    }
    default:
      throw new Error(`Unsupported component type: ${component.type}`);
  }
}

export function reverseDbToDsl(db: WireLangDb, options: DbToDslOptions = {}): string {
  const moduleImport = options.moduleImport ?? 'wirelang';
  const exportName = options.exportName ?? 'default';
  const preserveIds = options.preserveIds ?? true;

  const usedNames = new Set<string>();
  const imports = new Set<string>();
  const lines: string[] = [];

  imports.add('createSchematic');
  if (preserveIds) {
    imports.add('applyComponentIdentity');
    imports.add('applyNodeIdentity');
  }

  const componentVars = new Map<string, string>();
  const nodeVars = new Map<string, string>();

  for (const component of db.components) {
    const baseName = component.label ?? component.id ?? component.type ?? 'component';
    const varName = toSafeIdentifier(baseName, 'component', usedNames);
    componentVars.set(component.id, varName);
    const { imports: componentImports } = buildComponentExpression(component);
    componentImports.forEach(name => imports.add(name));
  }

  for (const node of db.nodes) {
    const baseName = node.name ?? node.id ?? 'node';
    const varName = toSafeIdentifier(`node_${baseName}`, 'node', usedNames);
    nodeVars.set(node.id, varName);
  }

  lines.push(`import { ${Array.from(imports).sort().join(', ')} } from ${toLiteral(moduleImport)};`);
  lines.push('');
  lines.push(`const s = createSchematic(${toLiteral(db.name ?? 'unnamed')});`);
  lines.push('');

  for (const component of db.components) {
    const varName = componentVars.get(component.id)!;
    const { expression } = buildComponentExpression(component);
    lines.push(`const ${varName} = ${expression};`);

    if (preserveIds) {
      const pinIds: Record<string, string> = {};
      for (const pin of component.pins) {
        if (pin.id) {
          pinIds[pin.name] = pin.id;
        }
      }
      const identity: Record<string, unknown> = {};
      if (component.id) {
        identity.id = component.id;
      }
      if (component.label) {
        identity.label = component.label;
      }
      if (Object.keys(pinIds).length > 0) {
        identity.pinIds = pinIds;
      }

      if (Object.keys(identity).length > 0) {
        lines.push(`applyComponentIdentity(${varName}, ${toObjectLiteral(identity)});`);
      }
    }
  }

  if (db.components.length > 0) {
    lines.push('');
    const componentList = db.components.map(c => componentVars.get(c.id)!).join(', ');
    lines.push(`s.addComponents(${componentList});`);
  }

  if (db.nodes.length > 0) {
    lines.push('');
  }
  for (const node of db.nodes) {
    const varName = nodeVars.get(node.id)!;
    const nodeName = node.name ?? node.id;
    lines.push(`const ${varName} = s.createNode(${toLiteral(nodeName)});`);
    if (preserveIds && node.id) {
      lines.push(`applyNodeIdentity(${varName}, ${toLiteral(node.id)});`);
    }
  }

  if (db.nodes.length > 0) {
    lines.push('');
  }
  for (const component of db.components) {
    const compVar = componentVars.get(component.id)!;
    for (const pin of component.pins) {
      if (!pin.nodeId) {
        continue;
      }
      const nodeVar = nodeVars.get(pin.nodeId);
      if (!nodeVar) {
        continue;
      }
      lines.push(`s.connect(${compVar}.pin(${toLiteral(pin.name)}), ${nodeVar});`);
    }
  }

  lines.push('');
  if (exportName === 'default') {
    lines.push('export default s;');
  } else {
    lines.push(`export const ${exportName} = s;`);
  }

  return lines.join('\n');
}

// Alias exports for common naming
export const dslToDb = compileDslToDb;
export const dbToDsl = reverseDbToDsl;
export const dsl2db = compileDslToDb;
export const db2dsl = reverseDbToDsl;