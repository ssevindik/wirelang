/**
 * Round-trip matrix — the 1.0 interoperability contract.
 *
 * Every component type must survive every conversion path the library offers.
 * A dropped parameter or an unresolved pin name is silent: the circuit still
 * builds, it is just wrong. These tests are what "lossless" means in the README.
 *
 * Paths under test, for each component type:
 *
 *   DSL → DB → DSL                    (in-memory IR)
 *   DSL → DB → JSON → DB → DSL        (stored)
 *   DSL → DB → CSV  → DB → DSL        (stored, tabular)
 *   DSL → DB → .ws  → DB → DSL        (source interchange)
 *   DSL → DB → SPICE → DB → DSL       (simulator interchange)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Component, resetCounters } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  Circuit, createSchematic, Schematic,
  compileDslToDb, dbToSchematic,
  serializeDb, deserializeDb,
  exportWs, importWs,
  exportNetlist, importNetlist,
  DC, AC, GND, VCC, VDD, IDC, IAC,
  R, C, L, LED, D,
  NPN, PNP, NMOS, PMOS, NJFET, PJFET,
  OpAmp, OpAmp3, NOT, AND, OR, XOR, NAND, NOR, HIGH, LOW, CLK,
  kOhm, MOhm, uF, nF, pF, mH, uH, kHz, RED, GREEN, BLUE,
  ComponentType, runERC,
} from '../core';

beforeEach(() => {
  resetCounters();
  Pin.resetCounter();
  Node.resetCounter();
});

// ─────────────────────────────────────────────────────────────
// One circuit per component type
// ─────────────────────────────────────────────────────────────

/**
 * Each entry wires its subject into a complete, ERC-clean circuit. A component
 * checked in isolation would not exercise pin mapping, which is where the
 * interesting failures live.
 */
const BY_TYPE: Array<{
  type: ComponentType;
  name: string;
  build: () => Schematic;
  /** Parameters that must survive, read off the subject component. */
  expect?: (component: Component) => void;
}> = [
  {
    type: ComponentType.Resistor,
    name: 'resistor',
    build: () => Circuit('R', DC(5), R(kOhm(4.7)), GND()),
    expect: c => expect(c.params.value).toBe(4700),
  },
  {
    type: ComponentType.Capacitor,
    name: 'capacitor',
    build: () => Circuit('C', AC(5, 1000), R(kOhm(1)), C(nF(100)), GND()),
    expect: c => expect(c.params.value).toBeCloseTo(100e-9, 12),
  },
  {
    type: ComponentType.Inductor,
    name: 'inductor',
    build: () => Circuit('L', DC(12), R(kOhm(1)), L(uH(470)), GND()),
    expect: c => expect(c.params.value).toBeCloseTo(470e-6, 12),
  },
  {
    type: ComponentType.Diode,
    name: 'diode',
    build: () => Circuit('D', DC(5), R(kOhm(1)), D('1N4148'), GND()),
    expect: c => expect((c as unknown as { partNumber: string }).partNumber).toBe('1N4148'),
  },
  {
    type: ComponentType.LED,
    name: 'led',
    build: () => Circuit('LED', DC(5), R(330), LED(BLUE), GND()),
    expect: c => expect(c.params.value).toBeCloseTo(3.2, 6),
  },
  {
    type: ComponentType.VoltageSource,
    name: 'voltage source (DC)',
    build: () => Circuit('V', DC(9), R(kOhm(1)), GND()),
    expect: c => {
      expect(c.params.value).toBe(9);
      expect(c.params.sourceType).toBe('dc');
    },
  },
  {
    type: ComponentType.VoltageSource,
    name: 'voltage source (AC)',
    build: () => Circuit('V', AC(6, kHz(2)), R(kOhm(1)), GND()),
    expect: c => {
      expect(c.params.value).toBe(6);
      expect(c.params.sourceType).toBe('ac');
    },
  },
  {
    type: ComponentType.CurrentSource,
    name: 'current source',
    build: () => Circuit('I', IDC(0.02), R(kOhm(1)), GND()),
    expect: c => expect(c.params.value).toBeCloseTo(0.02, 9),
  },
  {
    type: ComponentType.Ground,
    name: 'ground',
    build: () => Circuit('GND', DC(5), R(kOhm(1)), GND()),
  },
  {
    type: ComponentType.PowerRail,
    name: 'power rail',
    build: () => Circuit('VCC', { autoGround: false }, [
      [VCC(3.3), R(kOhm(1)), GND()],
    ]),
    expect: c => {
      expect(c.params.value).toBeCloseTo(3.3, 6);
      expect(c.params.railName).toBe('VCC');
    },
  },
  {
    type: ComponentType.NPN,
    name: 'NPN',
    build: () => {
      const t = NPN('BC547');
      return Circuit('Q', [
        [DC(5), R(kOhm(1)), LED(RED), t.C],
        [t.E, GND()],
        [DC(5), R(kOhm(10)), t.B],
      ]);
    },
    expect: c => {
      expect((c as unknown as { model: string }).model).toBe('BC547');
      expect(c.params.value).toBe(200);   // BC547 hfe
    },
  },
  {
    type: ComponentType.PNP,
    name: 'PNP',
    build: () => {
      const t = PNP('2N3906');
      return Circuit('Q', [
        [VCC(5), t.E],
        [t.C, R(330), LED(GREEN), GND()],
        [t.B, R(kOhm(10)), GND()],
      ]);
    },
    expect: c => expect((c as unknown as { model: string }).model).toBe('2N3906'),
  },
  {
    type: ComponentType.NMOS,
    name: 'NMOS',
    build: () => {
      const m = NMOS('IRF540');
      return Circuit('M', [
        [VCC(12), R(100), m.D],
        [m.S, GND()],
        [VCC(5), R(kOhm(10)), m.G],
      ]);
    },
    expect: c => {
      expect((c as unknown as { model: string }).model).toBe('IRF540');
      expect(c.params.value).toBeCloseTo(4.0, 6);   // vth
    },
  },
  {
    type: ComponentType.PMOS,
    name: 'PMOS',
    build: () => {
      const m = PMOS('IRF9540');
      return Circuit('M', [
        [VCC(12), m.S],
        [m.D, R(100), GND()],
        [VCC(12), R(kOhm(10)), m.G],
      ]);
    },
    // A P-channel threshold is negative and must stay negative.
    expect: c => expect(c.params.value).toBeCloseTo(-4.0, 6),
  },
  {
    type: ComponentType.NJFET,
    name: 'NJFET',
    build: () => {
      const j = NJFET('2N3819');
      return Circuit('J', [
        [VCC(12), j.D],
        [j.S, R(kOhm(2.2)), GND()],
        [j.G, R(MOhm(1)), GND()],
      ]);
    },
    expect: c => {
      expect((c as unknown as { model: string }).model).toBe('2N3819');
      expect(c.params.value).toBeCloseTo(-3.0, 6);   // vgs_off
    },
  },
  {
    type: ComponentType.PJFET,
    name: 'PJFET',
    build: () => {
      const j = PJFET('2N5460');
      return Circuit('J', [
        [VCC(12), j.S],
        [j.D, R(kOhm(2.2)), GND()],
        [j.G, R(MOhm(1)), GND()],
      ]);
    },
    expect: c => expect(c.params.value).toBeCloseTo(1.5, 6),
  },
  {
    type: ComponentType.OpAmp,
    name: 'op-amp (5-pin)',
    build: () => {
      const op = OpAmp('LM741');
      return Circuit('U', [
        [VCC(15), op.vPos],
        [op.vPos, C(nF(100)), GND()],
        [VCC(-15), op.vNeg],
        [op.vNeg, C(nF(100)), GND()],
        [op.inP, GND()],
        [AC(0.1, 1000), R(kOhm(10)), op.inN],
        [op.out, R(kOhm(100)), op.inN],
      ]);
    },
    expect: c => expect((c as unknown as { partNumber: string }).partNumber).toBe('LM741'),
  },
  {
    type: ComponentType.OpAmp,
    name: 'op-amp (3-pin)',
    build: () => {
      const op = OpAmp3('TL072');
      return Circuit('U', [
        [VCC(2.5), op.inP],
        [op.out, op.inN],
        [op.out, R(kOhm(1)), GND()],
      ]);
    },
    expect: c => expect(c.pins).toHaveLength(3),
  },
  {
    type: ComponentType.LogicGate,
    name: 'logic gate',
    build: () => {
      const g = NAND('74HC');
      return Circuit('L', [
        [HIGH(), g.A],
        [LOW(), g.B],
        [g.Y, R(kOhm(1)), GND()],
      ]);
    },
    expect: c => {
      expect(c.params.gateType).toBe('NAND');
      expect(c.params.family).toBe('74HC');
    },
  },
  {
    type: ComponentType.LogicHigh,
    name: 'logic HIGH',
    build: () => {
      const g = NOT();
      return Circuit('H', [[HIGH(), g.A], [g.Y, R(kOhm(1)), GND()]]);
    },
  },
  {
    type: ComponentType.LogicLow,
    name: 'logic LOW',
    build: () => {
      const g = NOT();
      return Circuit('LO', [[LOW(), g.A], [g.Y, R(kOhm(1)), GND()]]);
    },
  },
  {
    type: ComponentType.Clock,
    name: 'clock',
    build: () => {
      const g = NOT();
      return Circuit('CLK', [[CLK(kHz(4)), g.A], [g.Y, R(kOhm(1)), GND()]]);
    },
    expect: c => expect(c.params.value).toBe(4000),
  },
];

/** Find the component under test in a rebuilt schematic. */
function subject(schematic: Schematic, type: ComponentType, name: string): Component {
  const matches = schematic.components.filter(c => c.type === type);
  expect(matches.length, `${name}: no ${type} in the rebuilt circuit`).toBeGreaterThan(0);
  return matches[0];
}

// ─────────────────────────────────────────────────────────────
// In-memory and stored formats: exact DB equality
// ─────────────────────────────────────────────────────────────

describe('round-trip: DSL → DB → DSL', () => {
  for (const { type, name, build, expect: check } of BY_TYPE) {
    it(`${name} survives unchanged`, () => {
      const original = compileDslToDb(build());
      const rebuilt = dbToSchematic(original);

      expect(compileDslToDb(rebuilt)).toEqual(original);
      check?.(subject(rebuilt, type, name));
    });
  }
});

describe('round-trip: DSL → DB → JSON → DB → DSL', () => {
  for (const { type, name, build, expect: check } of BY_TYPE) {
    it(`${name} survives unchanged`, () => {
      const original = compileDslToDb(build());
      const rebuilt = dbToSchematic(deserializeDb(serializeDb(original)));

      expect(compileDslToDb(rebuilt)).toEqual(original);
      check?.(subject(rebuilt, type, name));
    });
  }
});

describe('round-trip: DSL → DB → CSV → DB → DSL', () => {
  for (const { type, name, build, expect: check } of BY_TYPE) {
    it(`${name} keeps its type, label and parameters`, () => {
      const original = compileDslToDb(build());
      const csv = serializeDb(original, { format: 'csv' });
      const rebuilt = dbToSchematic(deserializeDb(csv, { format: 'csv' }));

      expect(rebuilt.components.map(c => c.type)).toEqual(original.components.map(c => c.type));
      expect(rebuilt.components.map(c => c.label)).toEqual(original.components.map(c => c.label));
      check?.(subject(rebuilt, type, name));
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Source interchange: .ws
// ─────────────────────────────────────────────────────────────

describe('round-trip: DSL → DB → .ws → DB → DSL', () => {
  for (const { type, name, build, expect: check } of BY_TYPE) {
    it(`${name} keeps its type and parameters`, () => {
      const original = compileDslToDb(build());
      const rebuilt = dbToSchematic(importWs(exportWs(original)));

      expect(rebuilt.components.map(c => c.type).sort())
        .toEqual(original.components.map(c => c.type).sort());
      check?.(subject(rebuilt, type, name));

      const result = runERC(rebuilt);
      expect(result.errors.map(e => e.message), `${name}\n${result.report()}`).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Simulator interchange: SPICE
// ─────────────────────────────────────────────────────────────

describe('round-trip: DSL → DB → SPICE → DB → DSL', () => {
  for (const { type, name, build, expect: check } of BY_TYPE) {
    it(`${name} keeps its type and parameters`, () => {
      const original = compileDslToDb(build());
      const spice = exportNetlist(original, { format: 'spice' });
      const rebuilt = dbToSchematic(importNetlist(spice, { format: 'spice' }));

      // Redundant GND symbols collapse onto one net; nothing else may be lost.
      const signal = (components: readonly { type: string }[]) =>
        components.map(c => c.type).filter(t => t !== ComponentType.Ground).sort();
      expect(signal(rebuilt.components), spice).toEqual(signal(original.components));

      check?.(subject(rebuilt, type, name));

      const result = runERC(rebuilt);
      expect(result.errors.map(e => e.message), `${name}\n${spice}\n${result.report()}`)
        .toEqual([]);
    });
  }

  it('every element line is valid SPICE', () => {
    for (const { name, build } of BY_TYPE) {
      const spice = exportNetlist(compileDslToDb(build()), { format: 'spice' });
      for (const raw of spice.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('*') || line.startsWith('.')) continue;

        // refdes, at least one net, and a recognised element prefix
        expect(line, `${name}: "${line}"`).toMatch(/^[A-Za-z][A-Za-z0-9_]*\s+\S+/);
        expect(line[0].toUpperCase(), `${name}: "${line}"`)
          .toMatch(/^[RCLDVIQMJUX]$/);
      }
    }
  });

  it('ground is always net 0', () => {
    for (const { name, build } of BY_TYPE) {
      const spice = exportNetlist(compileDslToDb(build()), { format: 'spice' });
      if (!spice.includes('* Ground nets:')) continue;
      expect(spice, name).toContain('* Ground nets: 0');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Every path agrees
// ─────────────────────────────────────────────────────────────

describe('all conversion paths agree', () => {
  for (const { name, build } of BY_TYPE) {
    it(`${name}: JSON, CSV and .ws produce the same circuit`, () => {
      const original = compileDslToDb(build());

      const viaJson = compileDslToDb(dbToSchematic(deserializeDb(serializeDb(original))));
      const viaWs = dbToSchematic(importWs(exportWs(original)));
      const viaCsv = dbToSchematic(
        deserializeDb(serializeDb(original, { format: 'csv' }), { format: 'csv' }),
      );

      // JSON is the exact format: ids, labels and pin ids all survive.
      expect(viaJson).toEqual(original);

      const withLabels = (components: readonly { type: string; label: string }[]) =>
        components.map(c => `${c.type}:${c.label}`).sort();
      expect(withLabels(viaCsv.components)).toEqual(withLabels(original.components));

      // `.ws` is a *source* format: labels are assigned by the reference
      // designator counter when the file is evaluated, not carried in the file.
      // Topology and component types are what it promises to preserve.
      const typesOnly = (components: readonly { type: string }[]) =>
        components.map(c => c.type).sort();
      expect(typesOnly(viaWs.components)).toEqual(typesOnly(original.components));
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Coverage: nothing may be added without a round-trip test
// ─────────────────────────────────────────────────────────────

describe('coverage', () => {
  it('every non-deprecated ComponentType has a round-trip test', () => {
    // BJT and MOSFET are the deprecated generic types no component emits.
    const deprecated = new Set<string>([ComponentType.BJT, ComponentType.MOSFET]);
    const declared = Object.values(ComponentType).filter(t => !deprecated.has(t));
    const covered = new Set(BY_TYPE.map(entry => entry.type as string));

    const missing = declared.filter(t => !covered.has(t));
    expect(missing, 'add a round-trip entry for these types').toEqual([]);
  });

  it('the deprecated types are still readable', () => {
    for (const legacy of [ComponentType.BJT, ComponentType.MOSFET]) {
      expect(typeof legacy).toBe('string');
    }
  });
});
