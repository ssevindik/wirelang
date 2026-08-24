/**
 * WireScript ERC — Test Suite
 *
 * Every rule gets a circuit that must trigger it and a circuit that must not.
 * The "must not" half matters as much as the first: an ERC that cries wolf on
 * working circuits gets switched off.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Component, resetCounters } from '../core/Component';
import { Pin } from '../core/Pin';
import { Node } from '../core/Node';
import {
  Circuit, createSchematic,
  DC, AC, GND, VCC, VDD, R, C, L, LED, D,
  NPN, PNP, NMOS, OpAmp, OpAmp3,
  NOT, AND, HIGH, LOW, CLK,
  kOhm, MOhm, uF, nF, mH, kHz, RED, GREEN,
  runERC, listERCRules, getERCRule, ERC_RULES,
  ComponentType, PinType, PinDirection,
} from '../core';

beforeEach(() => {
  resetCounters();
  Pin.resetCounter();
});

/** Assert a rule fired, with its message for a readable failure. */
function expectRule(result: ReturnType<typeof runERC>, ruleId: string) {
  const hits = result.byRule(ruleId);
  expect(
    hits.length,
    `expected ${ruleId} to fire.\n${result.report()}`,
  ).toBeGreaterThan(0);
  return hits[0];
}

/** Assert a rule did NOT fire. */
function expectNoRule(result: ReturnType<typeof runERC>, ruleId: string) {
  expect(
    result.byRule(ruleId).map(v => v.message),
    `expected ${ruleId} not to fire`,
  ).toEqual([]);
}

// ═════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════

describe('rule registry', () => {
  it('exposes every rule with a unique key and id', () => {
    const keys = ERC_RULES.map(r => r.key);
    const ids = ERC_RULES.map(r => r.id);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.startsWith('ERC_'))).toBe(true);
  });

  it('every rule declares a severity for all three presets', () => {
    for (const rule of ERC_RULES) {
      expect(rule.severity.strict, rule.id).toBeDefined();
      expect(rule.severity.balanced, rule.id).toBeDefined();
      expect(rule.severity.relaxed, rule.id).toBeDefined();
      expect(rule.description.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('looks rules up by key and by id', () => {
    expect(getERCRule('shortCircuit')?.id).toBe('ERC_SHORT_CIRCUIT');
    expect(getERCRule('ERC_SHORT_CIRCUIT')?.key).toBe('shortCircuit');
    expect(getERCRule('nope')).toBeUndefined();
  });

  it('listERCRules() returns the full catalogue', () => {
    expect(listERCRules()).toHaveLength(ERC_RULES.length);
  });
});

// ═════════════════════════════════════════════════════════════
// Topology & connectivity
// ═════════════════════════════════════════════════════════════

describe('ERC_EMPTY_CIRCUIT', () => {
  it('errors on a schematic with no components', () => {
    const result = runERC(createSchematic('nothing'));
    expect(expectRule(result, 'ERC_EMPTY_CIRCUIT').severity).toBe('error');
  });

  it('does not fire once a component exists', () => {
    expectNoRule(
      runERC(Circuit('ok', DC(5), R(kOhm(1)), GND())),
      'ERC_EMPTY_CIRCUIT',
    );
  });
});

describe('ERC_NO_GROUND', () => {
  it('errors when the circuit has no ground reference', () => {
    const circuit = Circuit('No Ground', { autoGround: false }, [
      [DC(5), R(kOhm(1))],
    ]);
    expect(expectRule(runERC(circuit), 'ERC_NO_GROUND').severity).toBe('error');
  });

  it('passes when GND is present', () => {
    expectNoRule(
      runERC(Circuit('With Ground', DC(5), R(kOhm(1)), GND())),
      'ERC_NO_GROUND',
    );
  });

  it('autoGround places a GND symbol on the source return path', () => {
    const v = DC(5), r = R(kOhm(1));
    const circuit = Circuit('auto', [
      [v.pin('positive'), r.pin('1')],
      [r.pin('2'), v.pin('negative')],
    ]);
    // The symbol is really placed, not inferred: a source's negative terminal
    // is never an implicit 0V reference on its own.
    expect(circuit.components.some(c => c.type === ComponentType.Ground)).toBe(true);
    expect(runERC(circuit).violations).toEqual([]);
  });

  it('autoGround: false leaves the missing reference an error', () => {
    const v = DC(5), r = R(kOhm(1));
    const circuit = Circuit('manual', { autoGround: false }, [
      [v.pin('positive'), r.pin('1')],
      [r.pin('2'), v.pin('negative')],
    ]);
    expect(circuit.components.some(c => c.type === ComponentType.Ground)).toBe(false);
    expect(expectRule(runERC(circuit), 'ERC_NO_GROUND').severity).toBe('error');
  });
});

describe('ERC_UNCONNECTED_PIN', () => {
  it('errors on a component terminal wired to nothing', () => {
    const s = createSchematic('dangling');
    s.addComponent(R(kOhm(1)));
    s.addComponent(GND());
    const v = expectRule(runERC(s), 'ERC_UNCONNECTED_PIN');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('R1');
  });

  it('reports every unconnected terminal separately', () => {
    const s = createSchematic('dangling');
    s.addComponent(R(kOhm(1)));
    expect(runERC(s).byRule('ERC_UNCONNECTED_PIN')).toHaveLength(2);
  });

  it('does not fire on a fully wired circuit', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_UNCONNECTED_PIN',
    );
  });
});

describe('ERC_DANGLING_NET', () => {
  it('errors when a net carries a single terminal', () => {
    const s = createSchematic('one-pin-net');
    const r = R(kOhm(1));
    const gnd = GND();
    s.addComponent(r).addComponent(gnd);
    const lonely = s.createNode('stub');
    s.connect(r.p1, lonely);
    s.connect(r.p2, gnd.getGroundNode());
    s.addNode(gnd.getGroundNode());

    const v = expectRule(runERC(s), 'ERC_DANGLING_NET');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('stub');
  });

  it('accepts a lone GND or VCC symbol declaring a rail', () => {
    const circuit = Circuit('rail', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_DANGLING_NET');
  });
});

describe('ERC_DUPLICATE_REFDES', () => {
  it('errors when two components share a label', () => {
    const s = createSchematic('dupes');
    const a = R(kOhm(1));
    const b = R(kOhm(2));
    (b as unknown as { label: string }).label = a.label;
    s.addComponent(a).addComponent(b);
    expect(expectRule(runERC(s), 'ERC_DUPLICATE_REFDES').severity).toBe('error');
  });

  it('auto-numbers multiple power rails so they stay distinct', () => {
    const circuit = Circuit('rails', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), GND()],
      [VCC(5), R(kOhm(2)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_DUPLICATE_REFDES');
  });
});

describe('ERC_ISOLATED_SECTION', () => {
  it('warns about components with no path to ground', () => {
    const stray = R(kOhm(10));
    const circuit = Circuit('island', [
      [DC(5), R(330), LED(RED), GND()],
      [stray.p1, R(kOhm(22)), stray.p2],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_ISOLATED_SECTION');
    expect(v.severity).toBe('warning');
  });

  it('does not fire when everything reaches ground', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_ISOLATED_SECTION',
    );
  });
});

describe('ERC_FLOATING_NODE', () => {
  it('errors when a node reaches ground only through a capacitor', () => {
    const v = DC(5), r1 = R(kOhm(1)), c1 = C(uF(1)), r2 = R(kOhm(10)), g = GND();
    const circuit = Circuit('ac-coupled', { autoGround: false }, [
      [v.pin('positive'), r1.pin('1')],
      [r1.pin('2'), v.pin('negative'), g.pin('gnd')],
      [r1.pin('2'), c1.pin('1')],
      [c1.pin('2'), r2.pin('1')],
      [r2.pin('2'), c1.pin('2')],
    ]);
    const hit = expectRule(runERC(circuit), 'ERC_FLOATING_NODE');
    expect(hit.severity).toBe('error');
    expect(hit.message).toContain('C1');
  });

  it('does not fire once the coupled node has a bias resistor to ground', () => {
    const v = DC(5), r1 = R(kOhm(1)), c1 = C(uF(1)), bias = R(kOhm(100)), g = GND();
    const circuit = Circuit('biased', { autoGround: false }, [
      [v.pin('positive'), r1.pin('1')],
      [r1.pin('2'), v.pin('negative'), g.pin('gnd')],
      [r1.pin('2'), c1.pin('1')],
      [c1.pin('2'), bias.pin('1')],
      [bias.pin('2'), g.pin('gnd')],
    ]);
    expectNoRule(runERC(circuit), 'ERC_FLOATING_NODE');
  });

  it('leaves a fully isolated section to ERC_ISOLATED_SECTION', () => {
    const stray = R(kOhm(10));
    const circuit = Circuit('island', [
      [DC(5), R(330), LED(RED), GND()],
      [stray.p1, R(kOhm(22)), stray.p2],
    ]);
    expectNoRule(runERC(circuit), 'ERC_FLOATING_NODE');
  });
});

describe('ERC_NC_PIN_CONNECTED', () => {
  class WithNoConnect extends Component {
    constructor() {
      super(ComponentType.OpAmp, { value: 0, unit: '' }, 'NC1');
    }
    protected createPins(): Pin[] {
      return [new Pin('nc', undefined, PinType.NoConnect)];
    }
    toString() { return 'NC'; }
  }

  it('errors when a no-connect pin is wired', () => {
    const s = createSchematic('nc');
    const part = new WithNoConnect();
    const gnd = GND();
    s.addComponent(part).addComponent(gnd);
    s.connect(part.pins[0], gnd.getGroundNode());
    s.connect(gnd.gnd, gnd.getGroundNode());
    expect(expectRule(runERC(s), 'ERC_NC_PIN_CONNECTED').severity).toBe('error');
  });

  it('leaves a no-connect pin alone when unconnected', () => {
    const s = createSchematic('nc');
    const part = new WithNoConnect();
    const gnd = GND();
    s.addComponent(part).addComponent(gnd);
    s.connect(gnd.gnd, gnd.getGroundNode());
    const result = runERC(s);
    expectNoRule(result, 'ERC_NC_PIN_CONNECTED');
    // The no-connect pin must not be reported as an unconnected pin either.
    expectNoRule(result, 'ERC_UNCONNECTED_PIN');
  });
});

describe('ERC_INVALID_VALUE', () => {
  it('surfaces a negative resistance as an ERC error', () => {
    const circuit = Circuit('bad', DC(5), R(-100), GND());
    expect(expectRule(runERC(circuit), 'ERC_INVALID_VALUE').severity).toBe('error');
  });

  it('surfaces a zero-capacitance capacitor', () => {
    const circuit = Circuit('bad', DC(5), C(0), GND());
    expectRule(runERC(circuit), 'ERC_INVALID_VALUE');
  });

  it('does not fire on valid values', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_INVALID_VALUE',
    );
  });
});

// ═════════════════════════════════════════════════════════════
// Power distribution & drive
// ═════════════════════════════════════════════════════════════

describe('ERC_SHORT_CIRCUIT', () => {
  it('errors when a source has both terminals on one net', () => {
    const result = runERC(Circuit('Shorted', DC(5), GND()));
    expect(expectRule(result, 'ERC_SHORT_CIRCUIT').severity).toBe('error');
  });

  it('errors when the return path has zero series resistance', () => {
    // An ideal inductor is a DC short — a classic way to kill a supply.
    const result = runERC(Circuit('L short', DC(5), L(mH(10)), GND()));
    expectRule(result, 'ERC_SHORT_CIRCUIT');
  });

  it('passes when a resistor is in series', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_SHORT_CIRCUIT',
    );
  });
});

describe('ERC_SUPPLY_SHORT', () => {
  it('errors when a rail sits directly on the ground net', () => {
    const circuit = Circuit('bolted', { autoGround: false }, [[VCC(5), GND()]]);
    const v = expectRule(runERC(circuit), 'ERC_SUPPLY_SHORT');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('5V');
  });

  it('errors when a rail reaches ground through zero resistance', () => {
    const led = LED(RED);
    const circuit = Circuit('no R', { autoGround: false }, [
      [VCC(12), led.anode],
      [led.cathode, GND()],
    ]);
    expectRule(runERC(circuit), 'ERC_SUPPLY_SHORT');
  });

  it('passes when a resistor is in the path', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_SUPPLY_SHORT',
    );
  });
});

describe('ERC_POWER_CONFLICT', () => {
  it('errors when rails at different voltages share a net', () => {
    const circuit = Circuit('fight', { autoGround: false }, [[VCC(5), VDD(3.3)]]);
    expect(expectRule(runERC(circuit), 'ERC_POWER_CONFLICT').severity).toBe('error');
  });

  it('passes when rails have the same voltage', () => {
    const circuit = Circuit('same', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), GND()],
      [VCC(5), R(kOhm(2)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_POWER_CONFLICT');
  });
});

describe('ERC_OUTPUT_CONFLICT', () => {
  it('errors when two push-pull outputs drive one net', () => {
    const not1 = NOT();
    const not2 = NOT();
    const circuit = Circuit('contention', { autoGround: false }, [
      [HIGH(), not1.A],
      [HIGH(), not2.A],
      [not1.Y, not2.Y],
    ]);
    expect(expectRule(runERC(circuit), 'ERC_OUTPUT_CONFLICT').severity).toBe('error');
  });

  it('errors when an output is tied straight to a rail', () => {
    const g = NOT();
    const circuit = Circuit('out to rail', { autoGround: false }, [
      [HIGH(), g.A],
      [g.Y, VCC(5)],
    ]);
    expectRule(runERC(circuit), 'ERC_OUTPUT_CONFLICT');
  });

  it('passes when outputs drive separate nets', () => {
    const not1 = NOT();
    const not2 = NOT();
    const circuit = Circuit('fine', { autoGround: false }, [
      [HIGH(), not1.A],
      [HIGH(), not2.A],
      [not1.Y, R(kOhm(1)), GND()],
      [not2.Y, R(kOhm(1)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_OUTPUT_CONFLICT');
  });
});

describe('ERC_MISSING_POWER_PIN', () => {
  it('errors when an OpAmp supply pin is unconnected', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('unpowered', { autoGround: false }, [
      [AC(0.1, 1000), R(kOhm(10)), op.inN],
      [op.out, R(kOhm(100)), op.inN],
      [op.inP, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_MISSING_POWER_PIN');
    expect(v.severity).toBe('error');
  });

  it('passes when both supply pins are connected', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('powered', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [AC(0.1, 1000), R(kOhm(10)), op.inN],
      [op.out, R(kOhm(100)), op.inN],
      [op.inP, GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_MISSING_POWER_PIN');
  });

  it('does not fire for a 3-pin OpAmp with no supply pins', () => {
    const op3 = OpAmp3('TL072');
    const circuit = Circuit('buffer', { autoGround: false }, [
      [VCC(2.5), op3.inP],
      [op3.out, op3.inN],
    ]);
    expectNoRule(runERC(circuit), 'ERC_MISSING_POWER_PIN');
  });
});

describe('ERC_POWER_INPUT_NOT_DRIVEN', () => {
  it('errors when a supply pin sits on a net with no source', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('no rail', { autoGround: false }, [
      [op.vPos, R(kOhm(1))],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, op.inN],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_POWER_INPUT_NOT_DRIVEN');
    expect(v.severity).toBe('error');
  });

  it('passes when the supply pin reaches a rail', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('powered', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, op.inN],
    ]);
    expectNoRule(runERC(circuit), 'ERC_POWER_INPUT_NOT_DRIVEN');
  });
});

describe('ERC_FLOATING_INPUT', () => {
  it('errors on an input pin wired to nothing', () => {
    const and1 = AND();
    const circuit = Circuit('floating B', { autoGround: false }, [
      [HIGH(), and1.A],
      [and1.Y, R(kOhm(1)), GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_FLOATING_INPUT');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('AND1.B');
  });

  it('errors on an input whose net has no driver', () => {
    const and1 = AND();
    const dangling = R(MOhm(1));
    const circuit = Circuit('no driver', { autoGround: false }, [
      [HIGH(), and1.A],
      [and1.B, dangling.p1],
      [and1.Y, R(kOhm(1)), GND()],
    ]);
    expectRule(runERC(circuit), 'ERC_FLOATING_INPUT');
  });

  it('accepts an input pulled to a rail through a resistor', () => {
    const and1 = AND();
    const circuit = Circuit('pulled up', { autoGround: false }, [
      [HIGH(), and1.A],
      [VCC(5), R(kOhm(10)), and1.B],
      [and1.Y, R(kOhm(1)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_FLOATING_INPUT');
  });

  it('does not treat a voltage source negative terminal as an input', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_FLOATING_INPUT',
    );
  });
});

describe('ERC_NO_LOAD', () => {
  it('warns when a capacitor blocks the only DC return path', () => {
    const result = runERC(Circuit('blocked', DC(5), C(uF(1)), GND()));
    const v = expectRule(result, 'ERC_NO_LOAD');
    expect(v.severity).toBe('warning');
    expect(v.message).toContain('capacitor');
  });

  it('does not fire when the return path runs through a transistor', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('switch', [
      [DC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [DC(5), R(kOhm(10)), t.B],
    ]);
    expectNoRule(runERC(circuit), 'ERC_NO_LOAD');
  });
});

describe('ERC_DRIVER_CONFLICT', () => {
  it('warns when an op-amp output drives a logic input', () => {
    const op = OpAmp('LM741');
    const g = NOT();
    const circuit = Circuit('analog to digital', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, op.inN],
      [op.out, g.A],
      [g.Y, R(kOhm(1)), GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_DRIVER_CONFLICT');
    expect(v.severity).toBe('warning');
  });
});

// ═════════════════════════════════════════════════════════════
// Device physics
// ═════════════════════════════════════════════════════════════

describe('ERC_REVERSE_POLARITY', () => {
  it('errors when an LED is wired backwards across the rails', () => {
    const s = createSchematic('Reversed LED');
    const led = LED(RED);
    const gnd = GND();
    const vcc = VCC(5);

    const gndNode = gnd.getGroundNode();
    led.anode.connectTo(gndNode);
    const vccNode = new Node('vcc');
    vcc.pins[0].connectTo(vccNode);
    led.cathode.connectTo(vccNode);

    s.addComponent(led).addComponent(gnd).addComponent(vcc);
    s.addNode(gndNode).addNode(vccNode);

    const v = expectRule(runERC(s), 'ERC_REVERSE_POLARITY');
    expect(v.severity).toBe('error');
  });

  it('errors on a reversed diode seen through a series resistor', () => {
    // The old engine missed this: neither terminal touches a source directly.
    const d = D();
    const circuit = Circuit('reversed', { autoGround: false }, [
      [VCC(5), d.cathode],
      [d.anode, R(kOhm(1)), GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_REVERSE_POLARITY');
    expect(v.message).toContain('reverse-biased');
  });

  it('passes for a correctly oriented LED', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_REVERSE_POLARITY',
    );
  });
});

describe('ERC_NO_CURRENT_LIMIT', () => {
  it('errors when an LED is straight across the supply', () => {
    const led = LED(RED);
    const circuit = Circuit('bare LED', { autoGround: false }, [
      [VCC(5), led.anode],
      [led.cathode, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_NO_CURRENT_LIMIT');
    expect(v.severity).toBe('error');
    expect(v.hint).toMatch(/resistor/i);
  });

  it('errors when the only series element is a zero-ohm resistor', () => {
    const led = LED(RED);
    const r = R(0);
    const circuit = Circuit('zero R', { autoGround: false }, [
      [VCC(5), r.p1],
      [r.p2, led.anode],
      [led.cathode, GND()],
    ]);
    expectRule(runERC(circuit), 'ERC_NO_CURRENT_LIMIT');
  });

  it('passes with a current-limiting resistor', () => {
    expectNoRule(
      runERC(Circuit('safe LED', DC(5), R(330), LED(RED), GND())),
      'ERC_NO_CURRENT_LIMIT',
    );
  });
});

describe('ERC_CURRENT_EXCEEDED', () => {
  it('errors when the computed forward current is over the rating', () => {
    const led = LED(RED);
    const r = R(47);
    const circuit = Circuit('too hot', { autoGround: false }, [
      [VCC(12), r.p1],
      [r.p2, led.anode],
      [led.cathode, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_CURRENT_EXCEEDED');
    expect(v.severity).toBe('error');
    expect(v.message).toMatch(/2\d\d\.\d+mA/);
  });

  it('respects an explicit maxCurrent rating', () => {
    const led = LED({ color: GREEN, maxCurrent: 0.35 });
    const r = R(47);
    const circuit = Circuit('high power LED', { autoGround: false }, [
      [VCC(12), r.p1],
      [r.p2, led.anode],
      [led.cathode, GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_CURRENT_EXCEEDED');
  });

  it('passes at a sane operating current', () => {
    expectNoRule(
      runERC(Circuit('safe LED', DC(5), R(330), LED(RED), GND())),
      'ERC_CURRENT_EXCEEDED',
    );
  });
});

describe('ERC_VOLTAGE_EXCEEDED', () => {
  it('errors when an LED sees more than its reverse breakdown', () => {
    const s = createSchematic('reverse stress');
    const led = LED(RED);
    const gnd = GND();
    const vcc = VCC(12);
    const gndNode = gnd.getGroundNode();
    led.anode.connectTo(gndNode);
    const vccNode = new Node('vcc');
    vcc.pins[0].connectTo(vccNode);
    led.cathode.connectTo(vccNode);
    s.addComponent(led).addComponent(gnd).addComponent(vcc);
    s.addNode(gndNode).addNode(vccNode);

    const v = expectRule(runERC(s), 'ERC_VOLTAGE_EXCEEDED');
    expect(v.severity).toBe('error');
  });

  it('does not fire on a forward-biased LED', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_VOLTAGE_EXCEEDED',
    );
  });
});

describe('ERC_POWER_DISSIPATION', () => {
  it('warns when a resistor exceeds its assumed rating', () => {
    const led = LED(RED);
    const r = R(47);
    const circuit = Circuit('hot resistor', { autoGround: false }, [
      [VCC(12), r.p1],
      [r.p2, led.anode],
      [led.cathode, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_POWER_DISSIPATION');
    expect(v.severity).toBe('warning');
  });

  it('honours a custom power rating', () => {
    const led = LED(RED);
    const r = R(47);
    const circuit = Circuit('hot resistor', { autoGround: false }, [
      [VCC(12), r.p1],
      [r.p2, led.anode],
      [led.cathode, GND()],
    ]);
    expectNoRule(runERC(circuit, { resistorPowerRating: 5 }), 'ERC_POWER_DISSIPATION');
  });

  it('passes for a normal LED dropper', () => {
    expectNoRule(
      runERC(Circuit('LED', DC(5), R(330), LED(RED), GND())),
      'ERC_POWER_DISSIPATION',
    );
  });
});

describe('ERC_FAN_OUT', () => {
  it('errors when a gate output drives more inputs than the limit', () => {
    const driver = NOT();
    const loads = Array.from({ length: 12 }, () => NOT());
    const circuit = Circuit('overloaded', { autoGround: false }, [
      [HIGH(), driver.A],
      ...loads.map(g => [driver.Y, g.A] as const),
      ...loads.map(g => [g.Y, R(kOhm(1)), GND()] as const),
    ] as never);
    const v = expectRule(runERC(circuit, { fanOutLimit: 10 }), 'ERC_FAN_OUT');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('12');
  });

  it('passes within the limit', () => {
    const driver = NOT();
    const loads = Array.from({ length: 4 }, () => NOT());
    const circuit = Circuit('fine', { autoGround: false }, [
      [HIGH(), driver.A],
      ...loads.map(g => [driver.Y, g.A] as const),
      ...loads.map(g => [g.Y, R(kOhm(1)), GND()] as const),
    ] as never);
    expectNoRule(runERC(circuit, { fanOutLimit: 10 }), 'ERC_FAN_OUT');
  });
});

describe('ERC_LOGIC_LEVEL_MISMATCH', () => {
  it('errors when a 74HC input sees 12V', () => {
    const g = NOT();
    const circuit = Circuit('overvolt', { autoGround: false }, [
      [VCC(12), g.A],
      [g.Y, R(kOhm(1)), GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_LOGIC_LEVEL_MISMATCH');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('74HC');
  });

  it('accepts 12V on a CD4000 input', () => {
    const g = NOT('CD4000');
    const circuit = Circuit('cmos', { autoGround: false }, [
      [VCC(12), g.A],
      [g.Y, R(kOhm(1)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_LOGIC_LEVEL_MISMATCH');
  });

  it('accepts 5V on a 74HC input', () => {
    const g = NOT();
    const circuit = Circuit('ok', { autoGround: false }, [
      [VCC(5), g.A],
      [g.Y, R(kOhm(1)), GND()],
    ]);
    expectNoRule(runERC(circuit), 'ERC_LOGIC_LEVEL_MISMATCH');
  });
});

describe('ERC_TRANSISTOR_NO_DRIVE', () => {
  it('errors when a BJT base is unconnected', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('floating base', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), t.C],
      [t.E, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_TRANSISTOR_NO_DRIVE');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('Base');
  });

  it('errors when a MOSFET gate is unconnected', () => {
    const m = NMOS();
    const circuit = Circuit('floating gate', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), m.D],
      [m.S, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_TRANSISTOR_NO_DRIVE');
    expect(v.message).toContain('Gate');
  });

  it('labels transistors with the standard Q / M prefixes', () => {
    expect(NPN('2N2222').label).toBe('Q1');
    expect(NMOS().label).toBe('M1');
  });

  it('passes when the base is properly driven', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('proper switch', [
      [DC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [DC(5), R(kOhm(10)), t.B],
    ]);
    expectNoRule(runERC(circuit), 'ERC_TRANSISTOR_NO_DRIVE');
  });
});

describe('ERC_TRANSISTOR_TERMINAL_FLOATING', () => {
  it('errors when a collector is unconnected', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('open collector', { autoGround: false }, [
      [VCC(5), R(kOhm(10)), t.B],
      [t.E, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_TRANSISTOR_TERMINAL_FLOATING');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('Collector');
  });

  it('passes when every terminal is wired', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('proper switch', [
      [DC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [DC(5), R(kOhm(10)), t.B],
    ]);
    expectNoRule(runERC(circuit), 'ERC_TRANSISTOR_TERMINAL_FLOATING');
  });
});

describe('ERC_BJT_NO_BASE_RESISTOR', () => {
  it('errors when a base hangs straight off a rail', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('no base R', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [VCC(5), t.B],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_BJT_NO_BASE_RESISTOR');
    expect(v.severity).toBe('error');
  });

  it('passes with a base resistor', () => {
    const t = NPN('2N2222');
    const circuit = Circuit('proper switch', [
      [DC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [DC(5), R(kOhm(10)), t.B],
    ]);
    expectNoRule(runERC(circuit), 'ERC_BJT_NO_BASE_RESISTOR');
  });

  it('does not apply to MOSFET gates', () => {
    const m = NMOS();
    const circuit = Circuit('fet', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), m.D],
      [m.S, GND()],
      [VCC(5), R(kOhm(100)), m.G],
    ]);
    expectNoRule(runERC(circuit), 'ERC_BJT_NO_BASE_RESISTOR');
  });
});

describe('ERC_MOSFET_GATE_UNDEFINED', () => {
  it('warns when a gate has no pull resistor', () => {
    const m = NMOS();
    const g = NOT();
    const circuit = Circuit('no pulldown', { autoGround: false }, [
      [HIGH(), g.A],
      [g.Y, m.G],
      [VCC(5), R(kOhm(1)), m.D],
      [m.S, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_MOSFET_GATE_UNDEFINED');
    expect(v.severity).toBe('warning');
  });

  it('passes when a gate resistor is present', () => {
    const m = NMOS();
    const circuit = Circuit('pulled down', { autoGround: false }, [
      [VCC(5), R(kOhm(1)), m.D],
      [m.S, GND()],
      [VCC(5), R(kOhm(100)), m.G],
    ]);
    expectNoRule(runERC(circuit), 'ERC_MOSFET_GATE_UNDEFINED');
  });
});

describe('ERC_OPAMP_OUTPUT_SHORTED', () => {
  it('errors when the output is tied to ground', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('shorted out', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.inN, R(kOhm(1)), GND()],
      [op.out, GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_OPAMP_OUTPUT_SHORTED');
    expect(v.severity).toBe('error');
  });

  it('passes when the output drives a load', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('normal', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, R(kOhm(100)), op.inN],
    ]);
    expectNoRule(runERC(circuit), 'ERC_OPAMP_OUTPUT_SHORTED');
  });
});

describe('ERC_OPAMP_NO_FEEDBACK', () => {
  it('warns when nothing connects out back to inN', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('open loop', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.inN, R(kOhm(10)), GND()],
      [op.out, R(kOhm(100)), GND()],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_OPAMP_NO_FEEDBACK');
    expect(v.severity).toBe('warning');
  });

  it('passes for an inverting amplifier', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('inverting', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [AC(0.1, 1000), R(kOhm(10)), op.inN],
      [op.out, R(kOhm(100)), op.inN],
    ]);
    expectNoRule(runERC(circuit), 'ERC_OPAMP_NO_FEEDBACK');
  });

  it('passes for a unity-gain buffer', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('buffer', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, op.inN],
    ]);
    expectNoRule(runERC(circuit), 'ERC_OPAMP_NO_FEEDBACK');
  });
});

describe('ERC_MISSING_DECOUPLING', () => {
  it('reports info when an IC supply pin has no bypass cap', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('no decoupling', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, op.inN],
    ]);
    const v = expectRule(runERC(circuit), 'ERC_MISSING_DECOUPLING');
    expect(v.severity).toBe('info');
  });

  it('passes when a bypass cap is present', () => {
    const op = OpAmp('LM741');
    const circuit = Circuit('decoupled', { autoGround: false }, [
      [VCC(15), op.vPos],
      [op.vPos, C(nF(100)), GND()],
      [VCC(-15), op.vNeg],
      [op.vNeg, C(nF(100)), GND()],
      [op.inP, GND()],
      [op.out, op.inN],
    ]);
    expectNoRule(runERC(circuit), 'ERC_MISSING_DECOUPLING');
  });
});

// ═════════════════════════════════════════════════════════════
// Path analysis — polarity and AC awareness
// ═════════════════════════════════════════════════════════════

describe('diode polarity in path analysis', () => {
  /** Textbook bridge rectifier — four diodes, RC load. */
  function bridgeRectifier() {
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
  }

  it('does not see a short through anti-parallel diodes', () => {
    // Regression: treating diodes as bidirectional made every bridge
    // rectifier look like a dead short.
    const result = runERC(bridgeRectifier());
    expectNoRule(result, 'ERC_SHORT_CIRCUIT');
    expectNoRule(result, 'ERC_SUPPLY_SHORT');
  });

  it('does not report reverse polarity on an AC-fed rectifier', () => {
    // Half the diodes in a bridge are reverse-biased at any instant.
    // That is the point of the circuit, not a fault.
    expectNoRule(runERC(bridgeRectifier()), 'ERC_REVERSE_POLARITY');
  });

  it('a bridge rectifier passes ERC outright', () => {
    const result = runERC(bridgeRectifier());
    expect(result.errors.map(e => e.message), result.report()).toEqual([]);
  });

  it('still reports a genuine reversal on a DC supply', () => {
    const d = D();
    const circuit = Circuit('reversed', { autoGround: false }, [
      [VCC(5), d.cathode],
      [d.anode, R(kOhm(1)), GND()],
    ]);
    expectRule(runERC(circuit), 'ERC_REVERSE_POLARITY');
  });
});

describe('AC coupling', () => {
  it('an AC source through a series capacitor is info, not a warning', () => {
    const result = runERC(Circuit('RC', AC(5, 1000), R(kOhm(1)), C(uF(0.1)), GND()));
    const v = expectRule(result, 'ERC_NO_LOAD');
    expect(v.severity).toBe('info');
    expect(result.passed).toBe(true);
  });

  it('a DC source with no return path stays a warning', () => {
    const v = expectRule(runERC(Circuit('DC', DC(5), C(uF(1)), GND())), 'ERC_NO_LOAD');
    expect(v.severity).toBe('warning');
  });
});

describe('DC impedance model', () => {
  it('treats an inductor as a DC short', () => {
    const result = runERC(Circuit('L', DC(5), L(mH(10)), GND()));
    expectRule(result, 'ERC_SHORT_CIRCUIT');
  });

  it('computes dissipation through an inductor to ground', () => {
    // 12V through 100Ω into an inductor (a DC short) = 120mA, 1.44W.
    const result = runERC(Circuit('Tank', DC(12), R(100), L(mH(10)), GND()));
    const v = expectRule(result, 'ERC_POWER_DISSIPATION');
    expect(v.message).toContain('1.44');
  });

  it('treats a capacitor as a DC open', () => {
    expectNoRule(runERC(Circuit('C', DC(5), C(uF(1)), GND())), 'ERC_SHORT_CIRCUIT');
  });
});

// ═════════════════════════════════════════════════════════════
// Engine behaviour
// ═════════════════════════════════════════════════════════════

describe('severity configuration', () => {
  const shortedLed = () => {
    const led = LED(RED);
    return Circuit('bare LED', { autoGround: false }, [
      [VCC(5), led.anode],
      [led.cathode, GND()],
    ]);
  };

  it('an explicit override wins over the preset', () => {
    const result = runERC(shortedLed(), {
      severity: { noCurrentLimit: 'warning' },
    });
    expect(expectRule(result, 'ERC_NO_CURRENT_LIMIT').severity).toBe('warning');
  });

  it('accepts an override keyed by ERC_* id', () => {
    const result = runERC(shortedLed(), {
      severity: { ERC_NO_CURRENT_LIMIT: 'info' },
    });
    expect(expectRule(result, 'ERC_NO_CURRENT_LIMIT').severity).toBe('info');
  });

  it("'off' disables a rule entirely", () => {
    const result = runERC(shortedLed(), { severity: { noCurrentLimit: 'off' } });
    expectNoRule(result, 'ERC_NO_CURRENT_LIMIT');
  });

  it('rules: { key: false } disables a rule', () => {
    const circuit = Circuit('No GND', { autoGround: false }, [[DC(5), R(kOhm(1))]]);
    expectNoRule(runERC(circuit, { rules: { noGround: false } }), 'ERC_NO_GROUND');
  });

  it('the relaxed preset downgrades soft rules to warnings', () => {
    const s = createSchematic('dangling');
    s.addComponent(R(kOhm(1)));
    s.addComponent(GND());
    expect(
      expectRule(runERC(s, { preset: 'relaxed' }), 'ERC_UNCONNECTED_PIN').severity,
    ).toBe('warning');
    expect(
      expectRule(runERC(s, { preset: 'balanced' }), 'ERC_UNCONNECTED_PIN').severity,
    ).toBe('error');
  });

  it('the strict preset escalates design-quality rules', () => {
    const led = LED(RED);
    const r = R(47);
    const circuit = Circuit('hot', { autoGround: false }, [
      [VCC(12), r.p1],
      [r.p2, led.anode],
      [led.cathode, GND()],
    ]);
    expect(
      expectRule(runERC(circuit, { preset: 'strict' }), 'ERC_POWER_DISSIPATION').severity,
    ).toBe('error');
  });

  it('a hard fault stays an error in every preset', () => {
    for (const preset of ['strict', 'balanced', 'relaxed'] as const) {
      const result = runERC(Circuit('Shorted', DC(5), GND()), { preset });
      expect(expectRule(result, 'ERC_SHORT_CIRCUIT').severity, preset).toBe('error');
    }
  });
});

describe('ERCResult', () => {
  const clean = () => Circuit('Clean', DC(5), R(330), LED(RED), GND());

  it('reports a well-formed circuit as clean', () => {
    const result = runERC(clean());
    expect(result.passed, result.report()).toBe(true);
    expect(result.clean, result.report()).toBe(true);
    expect(result.summary()).toContain('✅');
  });

  it('exposes counts, byRule and has()', () => {
    const result = runERC(Circuit('Short', DC(5), GND()));
    expect(result.counts.error).toBeGreaterThan(0);
    expect(result.has('shortCircuit')).toBe(true);
    expect(result.has('ERC_SHORT_CIRCUIT')).toBe(true);
    expect(result.has('fanOut')).toBe(false);
    expect(result.byRule('ERC_SHORT_CIRCUIT')).toHaveLength(1);
  });

  it('orders violations by severity', () => {
    const op = OpAmp('LM741');
    const result = runERC(Circuit('mixed', { autoGround: false }, [
      [VCC(15), op.vPos],
      [VCC(-15), op.vNeg],
      [op.inP, GND()],
      [op.out, GND()],
    ]));
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const seq = result.violations.map(v => rank[v.severity]);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
  });

  it('report() includes the fix hints', () => {
    const led = LED(RED);
    const result = runERC(Circuit('bare LED', { autoGround: false }, [
      [VCC(5), led.anode],
      [led.cathode, GND()],
    ]));
    expect(result.report()).toContain('↳');
    expect(result.report()).toContain('ERRORS');
  });

  it('summary() lists the rule ids', () => {
    const summary = runERC(Circuit('Short', DC(5), GND())).summary();
    expect(summary).toContain('ERC_SHORT_CIRCUIT');
    expect(summary).toContain('🔴');
  });

  it('toJSON() is serializable and carries labels', () => {
    const json = runERC(Circuit('Short', DC(5), GND())).toJSON();
    expect(json.passed).toBe(false);
    expect(JSON.parse(JSON.stringify(json)).violations[0].ruleId).toBeTruthy();
    expect(json.violations[0].components.length).toBeGreaterThan(0);
  });

  it('every violation carries rule identity and a message', () => {
    const result = runERC(Circuit('Short', DC(5), GND()));
    for (const v of result.violations) {
      expect(v.ruleId).toMatch(/^ERC_/);
      expect(v.ruleKey.length).toBeGreaterThan(0);
      expect(v.ruleName.length).toBeGreaterThan(0);
      expect(v.message.length).toBeGreaterThan(0);
    }
  });
});

describe('Schematic.erc()', () => {
  it('is callable directly on a schematic instance', () => {
    const result = Circuit('Inline ERC', DC(5), R(kOhm(1)), GND()).erc();
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.summary).toBe('function');
  });

  it('passes options through', () => {
    const circuit = Circuit('No GND', { autoGround: false }, [[DC(5), R(kOhm(1))]]);
    expect(circuit.erc({ rules: { noGround: false } }).has('noGround')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════
// Reference circuits must stay clean
// ═════════════════════════════════════════════════════════════

describe('known-good circuits produce no errors', () => {
  it('LED dropper', () => {
    const result = runERC(Circuit('LED', DC(5), R(330), LED(RED), GND()));
    expect(result.errors.map(e => e.message), result.report()).toEqual([]);
  });

  it('NPN low-side switch', () => {
    const t = NPN('2N2222');
    const result = runERC(Circuit('switch', [
      [DC(5), R(kOhm(1)), LED(RED), t.C],
      [t.E, GND()],
      [DC(5), R(kOhm(10)), t.B],
    ]));
    expect(result.errors.map(e => e.message), result.report()).toEqual([]);
  });

  it('inverting op-amp stage', () => {
    const op = OpAmp('LM741');
    // autoGround wires the AC source return to the ground net.
    const result = runERC(Circuit('inverting', [
      [VCC(15), op.vPos],
      [op.vPos, C(nF(100)), GND()],
      [VCC(-15), op.vNeg],
      [op.vNeg, C(nF(100)), GND()],
      [op.inP, GND()],
      [AC(0.1, 1000), R(kOhm(10)), op.inN],
      [op.out, R(kOhm(100)), op.inN],
    ]));
    expect(result.errors.map(e => e.message), result.report()).toEqual([]);
  });

  it('voltage divider', () => {
    const result = runERC(Circuit('divider', DC(9), R(kOhm(10)), R(kOhm(10)), GND()));
    expect(result.errors.map(e => e.message), result.report()).toEqual([]);
  });
});
