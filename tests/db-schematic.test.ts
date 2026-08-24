/**
 * dbToSchematic — DB back to the live IR
 *
 * The DB is the backbone every format converts through, so the round-trip
 * DSL → DB → DSL must be lossless. These tests pin that down per component
 * family, because a dropped param or an unresolved pin name is silent: the
 * circuit still builds, it is just wired wrong.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetCounters } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  Circuit, createSchematic, compileDslToDb, dbToSchematic, db2schematic,
  serializeDb, deserializeDb, exportNetlist, importNetlist,
  DC, AC, GND, VCC, VDD, R, C, L, LED, D,
  NPN, PNP, NMOS, PMOS, NJFET, PJFET, OpAmp, OpAmp3,
  NOT, AND, HIGH, LOW, CLK,
  kOhm, MOhm, uF, nF, mH, RED, GREEN,
  runERC, ComponentType,
} from '../core';

beforeEach(() => {
  resetCounters();
  Pin.resetCounter();
  Node.resetCounter();
});

/** Every circuit below must survive DSL → DB → Schematic → DB unchanged. */
const CIRCUITS: Array<[string, () => ReturnType<typeof Circuit>]> = [
  ['LED dropper', () => Circuit('LED', DC(5), R(330), LED(RED), GND())],
  ['voltage divider', () => Circuit('Div', DC(9), R(kOhm(10)), R(kOhm(10)), GND())],
  ['RC filter', () => Circuit('RC', AC(5, 1000), R(kOhm(1)), C(uF(0.1)), GND())],
  ['RL circuit', () => Circuit('RL', DC(12), R(100), L(mH(10)), GND())],
  ['NPN switch', () => {
    const t = NPN('2N2222');
    return Circuit('Q', [
      [DC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [DC(5), R(kOhm(10)), t.B],
    ]);
  }],
  ['PNP high-side', () => {
    const t = PNP('2N3906');
    return Circuit('Q', [
      [VCC(5), t.E],
      [t.C, R(330), LED(GREEN), GND()],
      [t.B, R(kOhm(10)), GND()],
    ]);
  }],
  ['NMOS low-side', () => {
    const m = NMOS('IRF540');
    return Circuit('M', [
      [VCC(12), R(100), m.D],
      [m.S, GND()],
      [VCC(5), R(kOhm(10)), m.G],
    ]);
  }],
  ['PMOS high-side', () => {
    const m = PMOS('IRF9540');
    return Circuit('M', [
      [VCC(12), m.S],
      [m.D, R(100), GND()],
      [VCC(12), R(kOhm(10)), m.G],
    ]);
  }],
  ['NJFET follower', () => {
    const j = NJFET('2N3819');
    return Circuit('J', [
      [VCC(12), j.D],
      [j.S, R(kOhm(2.2)), GND()],
      [j.G, R(MOhm(1)), GND()],
    ]);
  }],
  ['PJFET stage', () => {
    const j = PJFET('2N5460');
    return Circuit('J', [
      [VCC(12), j.S],
      [j.D, R(kOhm(2.2)), GND()],
      [j.G, R(MOhm(1)), GND()],
    ]);
  }],
  ['inverting op-amp', () => {
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
  }],
  ['unity buffer (3-pin)', () => {
    const op = OpAmp3('TL072');
    return Circuit('U', [
      [VCC(2.5), op.inP],
      [op.out, op.inN],
      [op.out, R(kOhm(1)), GND()],
    ]);
  }],
  ['logic gates', () => {
    const g = AND('74HC');
    const n = NOT('74HC');
    return Circuit('L', [
      [HIGH(), g.A],
      [LOW(), g.B],
      [g.Y, n.A],
      [n.Y, R(kOhm(1)), GND()],
    ]);
  }],
  ['clocked inverter', () => {
    const n = NOT();
    return Circuit('CLK', [
      [CLK(1000), n.A],
      [n.Y, R(kOhm(1)), GND()],
    ]);
  }],
  ['bridge rectifier', () => {
    const [d1, d2, d3, d4] = [D('1N4007'), D('1N4007'), D('1N4007'), D('1N4007')];
    const src = AC(12, 60);
    const load = R(kOhm(1));
    const smoothing = C(uF(100));
    const gnd = GND();
    return Circuit('Bridge', [
      [src.p, d1.anode, d2.cathode],
      [src.n, d3.anode, d4.cathode],
      [d1.cathode, d3.cathode, load.p1, smoothing.p1],
      [d2.anode, d4.anode, load.p2, smoothing.p2, gnd.gnd],
    ]);
  }],
];

describe('dbToSchematic — round-trip fidelity', () => {
  for (const [name, build] of CIRCUITS) {
    it(`${name}: DSL → DB → Schematic → DB is lossless`, () => {
      const original = compileDslToDb(build());
      const rebuilt = compileDslToDb(dbToSchematic(original));
      expect(rebuilt).toEqual(original);
    });
  }

  it('survives a trip through serialized JSON', () => {
    const original = compileDslToDb(Circuit('LED', DC(5), R(330), LED(RED), GND()));
    const rebuilt = compileDslToDb(
      dbToSchematic(deserializeDb(serializeDb(original))),
    );
    expect(rebuilt).toEqual(original);
  });

  it('survives a trip through DB CSV', () => {
    const original = compileDslToDb(Circuit('LED', DC(5), R(330), LED(RED), GND()));
    const rebuilt = compileDslToDb(
      dbToSchematic(deserializeDb(serializeDb(original, { format: 'csv' }), { format: 'csv' })),
    );
    expect(rebuilt.components.map(c => c.type)).toEqual(original.components.map(c => c.type));
    expect(rebuilt.components.map(c => c.label)).toEqual(original.components.map(c => c.label));
  });
});

describe('dbToSchematic — the rebuilt IR is usable', () => {
  it('preserves ids, labels and pin ids', () => {
    const db = compileDslToDb(Circuit('LED', DC(5), R(330), LED(RED), GND()));
    const schematic = dbToSchematic(db);

    expect(schematic.components.map(c => c.id)).toEqual(db.components.map(c => c.id));
    expect(schematic.components.map(c => c.label)).toEqual(db.components.map(c => c.label));
    for (const [i, component] of schematic.components.entries()) {
      expect(component.pins.map(p => p.id)).toEqual(db.components[i].pins.map(p => p.id));
    }
  });

  it('reconnects every pin the DB recorded', () => {
    const db = compileDslToDb(Circuit('LED', DC(5), R(330), LED(RED), GND()));
    const schematic = dbToSchematic(db);
    expect(schematic.getUnconnectedPins()).toHaveLength(0);
  });

  it('produces a schematic that passes ERC', () => {
    for (const [name, build] of CIRCUITS) {
      const rebuilt = dbToSchematic(compileDslToDb(build()));
      const result = runERC(rebuilt);
      expect(result.errors.map(e => e.message), `${name}\n${result.report()}`).toEqual([]);
    }
  });

  it('db2schematic is the same function', () => {
    expect(db2schematic).toBe(dbToSchematic);
  });

  it('rejects a component type it cannot construct', () => {
    expect(() => dbToSchematic({
      schema: 'wirescript-db@v1',
      name: 'bad',
      components: [{
        id: 'x_1', type: 'flux_capacitor', label: 'X1',
        params: { value: 0, unit: '' }, pins: [],
      }],
      nodes: [],
    })).toThrow(/flux_capacitor/);
  });

  it('materialises a node a pin references but the DB never declared', () => {
    const schematic = dbToSchematic({
      schema: 'wirescript-db@v1',
      name: 'orphan node',
      components: [{
        id: 'resistor_1', type: 'resistor', label: 'R1',
        params: { value: 100, unit: 'Ω' },
        pins: [
          { id: 'pin_1', name: '1', nodeId: 'node_missing' },
          { id: 'pin_2', name: '2', nodeId: 'node_missing' },
        ],
      }],
      nodes: [],
    });
    expect(schematic.nodes.map(n => n.id)).toContain('node_missing');
    expect(schematic.getUnconnectedPins()).toHaveLength(0);
  });
});

describe('SPICE round-trip through the live IR', () => {
  for (const [name, build] of CIRCUITS) {
    it(`${name}: survives DSL → SPICE → DB → Schematic`, () => {
      const original = compileDslToDb(build());
      const spice = exportNetlist(original, { format: 'spice' });
      const rebuilt = dbToSchematic(importNetlist(spice, { format: 'spice' }));

      // Ground symbols collapse onto one net, so component counts may drop by
      // the number of redundant GND symbols — but nothing else may be lost.
      const signalTypes = (types: string[]) =>
        types.filter(t => t !== ComponentType.Ground).sort();
      expect(signalTypes(rebuilt.components.map(c => c.type)))
        .toEqual(signalTypes(original.components.map(c => c.type)));

      const result = runERC(rebuilt);
      expect(result.errors.map(e => e.message), `${name}\n${result.report()}`).toEqual([]);
    });
  }

  it('keeps a power rail a power rail', () => {
    const db = compileDslToDb(Circuit('Rail', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), GND()],
    ]));
    const spice = exportNetlist(db, { format: 'spice' });

    // The rail must appear as a real supply element, not vanish.
    expect(spice).toMatch(/^VCC1\s+\S+\s+0\s+5$/m);
    expect(spice).toContain('* Power rails:');

    const rebuilt = importNetlist(spice);
    const rail = rebuilt.components.find(c => c.type === ComponentType.PowerRail);
    expect(rail).toBeDefined();
    expect(rail!.params.value).toBe(5);
    expect(rail!.params.railName).toBe('VCC');
    expect(rail!.pins).toHaveLength(1);
  });

  it('keeps two rails at different voltages distinct', () => {
    const db = compileDslToDb(Circuit('Rails', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), GND()],
      [VDD(3.3), R(kOhm(2)), GND()],
    ]));
    const rebuilt = importNetlist(exportNetlist(db, { format: 'spice' }));
    const rails = rebuilt.components.filter(c => c.type === ComponentType.PowerRail);
    expect(rails).toHaveLength(2);
    expect(rails.map(r => r.params.value).sort()).toEqual([3.3, 5]);
    expect(new Set(rails.map(r => r.label)).size).toBe(2);
  });

  it('emits transistor terminals in SPICE order, not declaration order', () => {
    const t = NPN('2N2222');
    const collector = R(kOhm(1));
    const base = R(kOhm(10));
    const db = compileDslToDb(Circuit('Q', [
      [VCC(5), collector, t.C],
      [t.E, GND()],
      [VCC(5), base, t.B],
    ]));
    const spice = exportNetlist(db, { format: 'spice' });

    // SPICE reads Q as collector, base, emitter. WireScript declares B, C, E —
    // emitting declaration order would swap collector and base.
    const line = spice.split('\n').find(l => l.startsWith('Q'))!;
    const [, cNet, bNet, eNet] = line.split(/\s+/);
    const nodeOf = (label: string, pin: string) =>
      db.components.find(c => c.label === label)!.pins.find(p => p.name === pin)!.nodeId;

    expect(cNet).toBe(nodeOf('Q1', 'C'));
    expect(bNet).toBe(nodeOf('Q1', 'B'));
    expect(eNet).toBe('0');
  });

  it('keeps an AC source AC', () => {
    const db = compileDslToDb(Circuit('RC', AC(12, 60), R(kOhm(1)), GND()));
    const spice = exportNetlist(db, { format: 'spice' });
    expect(spice).toContain('SIN(0 12 60)');

    const source = importNetlist(spice).components
      .find(c => c.type === ComponentType.VoltageSource)!;
    expect(source.params.sourceType).toBe('ac');
    expect(source.params.value).toBe(12);
    expect(source.extras?.frequency).toBe(60);
  });

  it('keeps a part number, even when it starts with a digit', () => {
    // `2N3819` and `1N4007` look numeric at the first character. Treating them
    // as values silently drops the model and zeroes the parameters.
    for (const [factory, part] of [
      [NPN, '2N2222'], [PNP, '2N3906'],
      [NMOS, 'IRF540'], [PMOS, 'IRF9540'],
      [NJFET, '2N3819'], [PJFET, '2N5460'],
    ] as const) {
      const device = factory(part);
      const db = compileDslToDb(createSchematic('m').addComponent(device));
      const rebuilt = importNetlist(exportNetlist(db, { format: 'spice' }));
      const record = rebuilt.components.find(c => c.type === device.type);
      expect(record?.extras?.model, part).toBe(part);
    }
  });

  it('a transistor imported by model keeps that model’s parameters', () => {
    const db = compileDslToDb(createSchematic('q').addComponent(NPN('BC547')));
    const spice = exportNetlist(db, { format: 'spice' });
    const rebuilt = dbToSchematic(importNetlist(spice));
    const transistor = rebuilt.components[0] as { model: string; hfe: number };

    expect(transistor.model).toBe('BC547');
    // BC547 has hfe 200 — a placeholder 0 from the netlist must not win.
    expect(transistor.hfe).toBe(200);
    expect(rebuilt.components[0].params.value).toBe(200);
  });

  it('uses the SPICE J element and refdes for JFETs', () => {
    const jfet = NJFET('2N3819');
    expect(jfet.label).toMatch(/^J\d+$/);

    const db = compileDslToDb(createSchematic('j').addComponent(jfet));
    const spice = exportNetlist(db, { format: 'spice' });
    expect(spice).toMatch(new RegExp(`^${jfet.label}\\s`, 'm'));
  });

  it('keeps a DC source DC', () => {
    const db = compileDslToDb(Circuit('DC', DC(9), R(kOhm(1)), GND()));
    const source = importNetlist(exportNetlist(db, { format: 'spice' })).components
      .find(c => c.type === ComponentType.VoltageSource)!;
    expect(source.params.sourceType).not.toBe('ac');
    expect(source.params.value).toBe(9);
  });
});
