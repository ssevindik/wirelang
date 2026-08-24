/**
 * Public API surface
 *
 * These tests are the contract. From 1.0.0 onwards, removing or renaming
 * anything listed here is a breaking change requiring a major version bump.
 *
 * A failure means one of two things:
 *   - You removed or renamed an export. That is breaking — was it intended?
 *   - You added an export. Add it to the list below; adding is a minor bump.
 */

import { describe, it, expect } from 'vitest';
import * as api from '../core';

/**
 * Every runtime value exported from `core/index.ts`, sorted.
 * Type-only exports are not listed — they carry no runtime binding.
 */
const PUBLIC_API = [
  // ── Enums ──
  'Color', 'ComponentType', 'LEDColor', 'PinDirection', 'PinType', 'SourceType',

  // ── Core classes ──
  'BJTComponent', 'Component', 'FETComponent', 'Node', 'Pin',
  'PolarizedTwoTerminalComponent', 'Schematic', 'ThreeTerminalComponent',
  'TwoTerminalComponent',
  'createGroundNode', 'createSchematic', 'resetCounters',

  // ── Passive components ──
  'C', 'Capacitor', 'Inductor', 'L', 'R', 'Resistor',

  // ── Diodes & LEDs ──
  'D', 'Diode', 'LED', 'LEDComponent', 'createLED',
  'AMBER', 'BLUE', 'CYAN', 'GREEN', 'IR', 'ORANGE', 'PINK', 'PURPLE', 'RED',
  'UV', 'WHITE', 'YELLOW',

  // ── Sources, ground and rails ──
  'AC', 'CurrentSource', 'DC', 'GND', 'Ground', 'IAC', 'IDC', 'VoltageSource',
  'PowerRail', 'VCC', 'VDD', 'VNEG', 'VPOS',

  // ── Transistors ──
  'NPN', 'NPNTransistor', 'PNP', 'PNPTransistor',
  'NMOS', 'NMOSTransistor', 'PMOS', 'PMOSTransistor',
  'NJFET', 'NJFETTransistor', 'PJFET', 'PJFETTransistor',

  // ── Analog ICs ──
  'LM358', 'LM741', 'NE5532', 'OpAmp', 'OpAmp3', 'OpAmp3Component',
  'OpAmpComponent', 'TL072',

  // ── Logic ──
  'AND', 'ANDGate', 'NAND', 'NANDGate', 'NOR', 'NORGate', 'NOT', 'NOTGate',
  'OR', 'ORGate', 'XOR', 'XORGate',
  'CLK', 'ClockSource', 'HIGH', 'LOW', 'LogicHigh', 'LogicLow',

  // ── DSL ──
  'Circuit', 'Parallel', 'Series', 'applyToCircuit', 'junction', 'toGround',
  'wire',

  // ── ERC ──
  'ERCContext', 'ERCResult', 'ERC_RULES', 'getERCRule', 'limitsCurrent',
  'listERCRules', 'runERC', 'seriesElementOf',

  // ── DB / serialization ──
  'compileDslToDb', 'db2dsl', 'db2schematic', 'dbToDsl', 'dbToSchematic',
  'deserializeDb', 'deserializeDbCsv', 'dsl2db', 'dslToDb',
  'resolveComponentType', 'reverseDbToDsl', 'serializeDb', 'serializeDbCsv',
  'applyComponentIdentity', 'applyNodeIdentity', 'applyPinIdentity',

  // ── Netlist & .ws interchange ──
  'db2netlist', 'dbToNetlist', 'exportNetlist', 'importNetlist', 'netlist2db',
  'netlistToDb',
  'db2ws', 'dbToWs', 'exportWs', 'importWs', 'ws2db', 'wsToDb',

  // ── Units ──
  'GIGA', 'KILO', 'MEGA', 'MICRO', 'MILLI', 'NANO', 'PICO',
  'MOhm', 'kOhm', 'ohm',
  'F', 'mF', 'nF', 'pF', 'uF',
  'H', 'mH', 'nH', 'uH',
  'V', 'kV', 'mV', 'uV',
  'A', 'mA', 'nA', 'uA',
  'GHz', 'Hz', 'MHz', 'kHz',
  'W', 'kW', 'mW', 'uW',
  'formatWithUnit', 'parseWithUnit',
].sort();

describe('public API surface', () => {
  it('exports exactly the documented set of names', () => {
    expect(Object.keys(api).sort()).toEqual(PUBLIC_API);
  });

  it('every exported name resolves to a defined value', () => {
    for (const name of PUBLIC_API) {
      expect((api as Record<string, unknown>)[name], name).toBeDefined();
    }
  });

  it('every component factory returns a Component with pins', () => {
    const factories: Array<[string, () => unknown]> = [
      ['R', () => api.R(100)],
      ['C', () => api.C(1e-6)],
      ['L', () => api.L(1e-3)],
      ['D', () => api.D()],
      ['LED', () => api.LED(api.RED)],
      ['DC', () => api.DC(5)],
      ['AC', () => api.AC(5, 1000)],
      ['IDC', () => api.IDC(0.01)],
      ['GND', () => api.GND()],
      ['VCC', () => api.VCC(5)],
      ['NPN', () => api.NPN()],
      ['PNP', () => api.PNP()],
      ['NMOS', () => api.NMOS()],
      ['PMOS', () => api.PMOS()],
      ['NJFET', () => api.NJFET()],
      ['PJFET', () => api.PJFET()],
      ['OpAmp', () => api.OpAmp()],
      ['OpAmp3', () => api.OpAmp3()],
      ['NOT', () => api.NOT()],
      ['AND', () => api.AND()],
      ['OR', () => api.OR()],
      ['XOR', () => api.XOR()],
      ['NAND', () => api.NAND()],
      ['NOR', () => api.NOR()],
      ['HIGH', () => api.HIGH()],
      ['LOW', () => api.LOW()],
      ['CLK', () => api.CLK(1000)],
    ];

    for (const [name, make] of factories) {
      const component = make() as api.Component;
      expect(component, name).toBeInstanceOf(api.Component);
      expect(component.pins.length, `${name} pins`).toBeGreaterThan(0);
      expect(component.label, `${name} label`).toBeTruthy();
      expect(component.type, `${name} type`).toBeTruthy();
      // Every pin must be reachable by the name ERC and the DB layer use.
      for (const pin of component.pins) {
        expect(component.getPin(pin.name), `${name}.${pin.name}`).toBe(pin);
      }
    }
  });
});

describe('ComponentType', () => {
  it('every transistor factory carries its own specific type', () => {
    expect(api.NPN().type).toBe(api.ComponentType.NPN);
    expect(api.PNP().type).toBe(api.ComponentType.PNP);
    expect(api.NMOS().type).toBe(api.ComponentType.NMOS);
    expect(api.PMOS().type).toBe(api.ComponentType.PMOS);
    expect(api.NJFET().type).toBe(api.ComponentType.NJFET);
    expect(api.PJFET().type).toBe(api.ComponentType.PJFET);
  });

  it('no component emits the legacy generic transistor types', () => {
    const factories = [
      api.NPN, api.PNP, api.NMOS, api.PMOS, api.NJFET, api.PJFET,
    ];
    for (const make of factories) {
      const type = make().type as string;
      expect(type, `${make.name} must not emit a legacy type`)
        .not.toBe(api.ComponentType.BJT);
      expect(type).not.toBe(api.ComponentType.MOSFET);
    }
  });

  it('every ComponentType value is a non-empty lowercase slug', () => {
    for (const [key, value] of Object.entries(api.ComponentType)) {
      expect(typeof value, key).toBe('string');
      expect(value, key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('keeps reading the legacy generic types for older DB files', () => {
    // wirescript-db@v1 files written before 0.5.0 carry "type": "bjt".
    expect(api.ComponentType.BJT).toBe('bjt');
    expect(api.ComponentType.MOSFET).toBe('mosfet');

    const legacy = {
      schema: 'wirescript-db@v1' as const,
      name: 'legacy',
      components: [{
        id: 'bjt_1',
        type: 'bjt',
        label: 'Q1',
        params: { value: 100, unit: 'hfe', model: '2N2222', transistorType: 'PNP' },
        pins: [
          { id: 'p1', name: 'B' },
          { id: 'p2', name: 'C' },
          { id: 'p3', name: 'E' },
        ],
      }],
      nodes: [],
    };
    expect(api.resolveComponentType(legacy.components[0])).toBe(api.ComponentType.PNP);
    expect(api.dbToSchematic(legacy).components[0].type).toBe(api.ComponentType.PNP);
  });
});
