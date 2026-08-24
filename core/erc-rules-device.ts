/**
 * WireScript ERC — Device physics rules.
 *
 * Rules that depend on what a component *is*: polarity, current and voltage
 * ratings, drive requirements, logic-family limits.
 */

import { Component } from './Component';
import { Pin } from './Pin';
import {
  ERCContext,
  FET_TYPES,
  IC_TYPES,
  Net,
  TRANSISTOR_TYPES,
  limitsCurrent,
} from './erc-model';
import { ERCFinding, ERCRule, ResolvedERCOptions } from './erc-types';
import { ComponentType, PinType } from './types';

const fmtV = (v: number) => `${Number(v.toFixed(3))}V`;
const fmtA = (a: number) =>
  a >= 1 ? `${Number(a.toFixed(3))}A` : `${Number((a * 1000).toFixed(2))}mA`;
const fmtW = (w: number) =>
  w >= 1 ? `${Number(w.toFixed(3))}W` : `${Number((w * 1000).toFixed(1))}mW`;
const fmtR = (r: number) =>
  r >= 1000 ? `${Number((r / 1000).toFixed(2))}kΩ` : `${Number(r.toFixed(2))}Ω`;

/**
 * Maximum supply voltage per logic family (absolute-maximum ratings).
 * Used to catch a 74HC gate hung off a 12V rail.
 */
const LOGIC_FAMILY_MAX_VCC: Record<string, number> = {
  '74HC': 6,
  '74HCT': 5.5,
  '74AC': 6,
  '74ACT': 5.5,
  '74LS': 7,
  '74S': 7,
  '74F': 7,
  '74': 7,
  'CD4000': 18,
  'CD4:': 18,
  'HEF4000': 18,
};

function logicFamilyMaxVcc(family: string): number | undefined {
  if (LOGIC_FAMILY_MAX_VCC[family] !== undefined) return LOGIC_FAMILY_MAX_VCC[family];
  const key = Object.keys(LOGIC_FAMILY_MAX_VCC).find(k => family.startsWith(k));
  return key ? LOGIC_FAMILY_MAX_VCC[key] : undefined;
}

/** Narrow a path result to the potential it found, and whether it is AC. */
function pathPotential(
  path: { potential: number; target: { isAC?: boolean } } | null,
): { potential: number; isAC?: boolean } | null {
  return path ? { potential: path.potential, isAC: path.target.isAC } : null;
}

/** Forward voltage a polarized part drops when conducting. */
function forwardVoltageOf(component: Component): number {
  return typeof component.params.value === 'number' ? component.params.value : 0.7;
}

/** Rated maximum forward current, if the model carries one. */
function maxCurrentOf(component: Component, fallback: number): number {
  const rated = (component as unknown as { maxCurrent?: number }).maxCurrent;
  return typeof rated === 'number' && rated > 0 ? rated : fallback;
}

/**
 * Estimate the DC current through a two-terminal device by finding the supply
 * and the ground return on either side of it.
 *
 * Returns `null` when the operating point cannot be derived statically.
 */
function estimateBranchCurrent(
  ctx: ERCContext,
  device: Component,
  anodeNet: Net,
  cathodeNet: Net,
): { current: number; supply: number; resistance: number } | null {
  const exclude = new Set([device]);

  const supplySide = anodeNet.potential !== undefined
    ? { potential: anodeNet.potential, resistance: 0 }
    : ctx.findSupplyPath(anodeNet, { exclude, direction: 'upstream' });
  const returnSide = cathodeNet.potential !== undefined
    ? { potential: cathodeNet.potential, resistance: 0 }
    : ctx.findSupplyPath(cathodeNet, { exclude, direction: 'downstream' });

  if (!supplySide || !returnSide) return null;

  const supply = supplySide.potential - returnSide.potential;
  const resistance = supplySide.resistance + returnSide.resistance;
  const headroom = supply - forwardVoltageOf(device);
  if (headroom <= 0) return null;                 // not forward-biased
  if (resistance <= 0) return { current: Infinity, supply, resistance: 0 };

  return { current: headroom / resistance, supply, resistance };
}

// ─────────────────────────────────────────────────────────────
// Polarized devices
// ─────────────────────────────────────────────────────────────

export const reversePolarity: ERCRule = {
  key: 'reversePolarity',
  id: 'ERC_REVERSE_POLARITY',
  name: 'Reverse Polarity',
  description: 'A polarized device is wired backwards relative to the supply.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const device of ctx.componentsOfType(ComponentType.Diode, ComponentType.LED)) {
      const anode = device.pins.find(p => p.name === 'anode');
      const cathode = device.pins.find(p => p.name === 'cathode');
      if (!anode?.isConnected() || !cathode?.isConnected()) continue;

      const anodeNet = ctx.netOf(anode);
      const cathodeNet = ctx.netOf(cathode);
      if (!anodeNet || !cathodeNet) continue;

      const exclude = new Set([device]);
      // Prefer a directly-known potential; otherwise trace through the passives.
      const anodeSource = anodeNet.potential !== undefined
        ? { potential: anodeNet.potential, isAC: anodeNet.isAC }
        : pathPotential(ctx.findSupplyPath(anodeNet, { exclude, direction: 'upstream' }));
      const cathodeSource = cathodeNet.potential !== undefined
        ? { potential: cathodeNet.potential, isAC: cathodeNet.isAC }
        : pathPotential(ctx.findSupplyPath(cathodeNet, { exclude, direction: 'downstream' }));

      if (!anodeSource || !cathodeSource) continue;
      // Under AC the polarity reverses every half cycle — in a rectifier, being
      // reverse-biased half the time is the whole point.
      if (anodeSource.isAC || cathodeSource.isAC) continue;

      const vAnode = anodeSource.potential;
      const vCathode = cathodeSource.potential;
      if (vAnode >= vCathode) continue;

      const kind = device.type === ComponentType.LED ? 'LED' : 'Diode';
      findings.push({
        message: `${device.label}: anode sits at ${fmtV(vAnode)} and cathode at ${fmtV(vCathode)}. The ${kind} is reverse-biased and will not conduct${device.type === ComponentType.LED ? ' or light' : ''}.`,
        hint: `Swap ${device.label}.anode and ${device.label}.cathode.`,
        components: [device],
        nodes: [anodeNet.node, cathodeNet.node],
        pins: [anode, cathode],
      });
    }
    return findings;
  },
};

export const noCurrentLimit: ERCRule = {
  key: 'noCurrentLimit',
  id: 'ERC_NO_CURRENT_LIMIT',
  name: 'No Current Limiting',
  description: 'A diode or LED conducts from supply to ground with no series resistance.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const device of ctx.componentsOfType(ComponentType.Diode, ComponentType.LED)) {
      const anode = device.pins.find(p => p.name === 'anode');
      const cathode = device.pins.find(p => p.name === 'cathode');
      if (!anode?.isConnected() || !cathode?.isConnected()) continue;

      const anodeNet = ctx.netOf(anode);
      const cathodeNet = ctx.netOf(cathode);
      if (!anodeNet || !cathodeNet) continue;

      const estimate = estimateBranchCurrent(ctx, device, anodeNet, cathodeNet);
      if (!estimate) continue;
      if (Number.isFinite(estimate.current)) continue;   // limited by something

      const kind = device.type === ComponentType.LED ? 'LED' : 'diode';
      findings.push({
        message: `${device.label}: forward-biased across ${fmtV(estimate.supply)} with zero series resistance. Forward current is limited only by the supply — the ${kind} will be destroyed.`,
        hint: `Add a series resistor. For ${fmtV(estimate.supply)} and Vf=${fmtV(forwardVoltageOf(device))} at 10mA, use about ${fmtR(Math.max(1, Math.round((estimate.supply - forwardVoltageOf(device)) / 0.01)))}.`,
        components: [device],
        nodes: [anodeNet.node, cathodeNet.node],
        pins: [anode, cathode],
      });
    }
    return findings;
  },
};

export const currentExceeded: ERCRule = {
  key: 'currentExceeded',
  id: 'ERC_CURRENT_EXCEEDED',
  name: 'Maximum Current Exceeded',
  description: 'Computed forward current is above the device rating.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx, options: ResolvedERCOptions) {
    const findings: ERCFinding[] = [];
    for (const device of ctx.componentsOfType(ComponentType.Diode, ComponentType.LED)) {
      const anode = device.pins.find(p => p.name === 'anode');
      const cathode = device.pins.find(p => p.name === 'cathode');
      if (!anode?.isConnected() || !cathode?.isConnected()) continue;

      const anodeNet = ctx.netOf(anode);
      const cathodeNet = ctx.netOf(cathode);
      if (!anodeNet || !cathodeNet) continue;

      const estimate = estimateBranchCurrent(ctx, device, anodeNet, cathodeNet);
      // Unbounded current is ERC_NO_CURRENT_LIMIT's finding, not this rule's.
      if (!estimate || !Number.isFinite(estimate.current)) continue;

      const rated = maxCurrentOf(device, options.defaultDiodeCurrent);
      if (estimate.current <= rated) continue;

      const suggested = Math.ceil((estimate.supply - forwardVoltageOf(device)) / (rated * 0.8));
      findings.push({
        message: `${device.label}: forward current is about ${fmtA(estimate.current)} through ${fmtR(estimate.resistance)} from ${fmtV(estimate.supply)}, above its ${fmtA(rated)} rating.`,
        hint: `Increase the series resistance to at least ${fmtR(suggested)}.`,
        components: [device],
        nodes: [anodeNet.node, cathodeNet.node],
        pins: [anode, cathode],
      });
    }
    return findings;
  },
};

export const voltageExceeded: ERCRule = {
  key: 'voltageExceeded',
  id: 'ERC_VOLTAGE_EXCEEDED',
  name: 'Voltage Rating Exceeded',
  description: 'A device sees more voltage than it is rated for.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];

    // LEDs and diodes: reverse voltage across a non-conducting junction.
    for (const device of ctx.componentsOfType(ComponentType.LED)) {
      const anode = device.pins.find(p => p.name === 'anode');
      const cathode = device.pins.find(p => p.name === 'cathode');
      if (!anode?.isConnected() || !cathode?.isConnected()) continue;
      const anodeNet = ctx.netOf(anode);
      const cathodeNet = ctx.netOf(cathode);
      if (!anodeNet || !cathodeNet) continue;

      // Typical LED reverse breakdown is 5V.
      const vAnode = anodeNet.potential;
      const vCathode = cathodeNet.potential;
      if (vAnode === undefined || vCathode === undefined) continue;
      const reverse = vCathode - vAnode;
      if (reverse > 5) {
        findings.push({
          message: `${device.label}: reverse voltage is ${fmtV(reverse)}, above the ~5V reverse breakdown of a typical LED. The junction will break down.`,
          hint: `Add a reverse-protection diode in series with ${device.label}, or reduce the reverse voltage.`,
          components: [device],
          nodes: [anodeNet.node, cathodeNet.node],
          pins: [anode, cathode],
        });
      }
    }
    return findings;
  },
};

export const powerDissipation: ERCRule = {
  key: 'powerDissipation',
  id: 'ERC_POWER_DISSIPATION',
  name: 'Power Dissipation Exceeded',
  description: 'A resistor dissipates more power than its assumed rating.',
  severity: { strict: 'error', balanced: 'warning', relaxed: 'info' },
  check(ctx, options: ResolvedERCOptions) {
    const findings: ERCFinding[] = [];
    for (const resistor of ctx.componentsOfType(ComponentType.Resistor)) {
      const [a, b] = resistor.pins;
      if (!a?.isConnected() || !b?.isConnected()) continue;
      const netA = ctx.netOf(a);
      const netB = ctx.netOf(b);
      if (!netA || !netB) continue;

      const exclude = new Set([resistor]);
      const sideA = netA.potential !== undefined
        ? { potential: netA.potential, resistance: 0 }
        : ctx.findSupplyPath(netA, { exclude, direction: 'upstream' });
      const sideB = netB.potential !== undefined
        ? { potential: netB.potential, resistance: 0 }
        : ctx.findSupplyPath(netB, { exclude, direction: 'downstream' });
      if (!sideA || !sideB) continue;

      const ohms = resistor.params.value;
      if (!(ohms > 0)) continue;                    // 0 Ω is ERC_INVALID_VALUE

      const across = Math.abs(sideA.potential - sideB.potential);
      const totalR = ohms + sideA.resistance + sideB.resistance;
      if (totalR <= 0) continue;
      const current = across / totalR;
      const watts = current * current * ohms;

      const rating = options.resistorPowerRating;
      if (watts <= rating) continue;

      findings.push({
        message: `${resistor.label}: dissipates about ${fmtW(watts)} (${fmtA(current)} through ${fmtR(ohms)}), above the assumed ${fmtW(rating)} rating. It will overheat.`,
        hint: `Use a resistor rated for at least ${fmtW(watts * 2)}, or raise the resistance.`,
        components: [resistor],
        nodes: [netA.node, netB.node],
      });
    }
    return findings;
  },
};

// ─────────────────────────────────────────────────────────────
// Logic
// ─────────────────────────────────────────────────────────────

export const fanOut: ERCRule = {
  key: 'fanOut',
  id: 'ERC_FAN_OUT',
  name: 'Fan-Out Exceeded',
  description: 'A logic output drives more inputs than its family allows.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx, options: ResolvedERCOptions) {
    const findings: ERCFinding[] = [];
    for (const gate of ctx.componentsOfType(ComponentType.LogicGate)) {
      const out = gate.pins.find(p => p.type === PinType.Output);
      if (!out?.isConnected()) continue;
      const net = ctx.netOf(out);
      if (!net) continue;

      const loads = net.pins.filter(p => p !== out && p.type === PinType.Input);
      if (loads.length <= options.fanOutLimit) continue;

      findings.push({
        message: `${gate.label}: output drives ${loads.length} logic inputs, above the fan-out limit of ${options.fanOutLimit}. VOL rises above VIL and the logic level becomes unreliable.`,
        hint: `Insert a buffer, or split the load across ${Math.ceil(loads.length / options.fanOutLimit)} drivers.`,
        components: [gate],
        nodes: [net.node],
        pins: [out],
      });
    }
    return findings;
  },
};

export const logicLevelMismatch: ERCRule = {
  key: 'logicLevelMismatch',
  id: 'ERC_LOGIC_LEVEL_MISMATCH',
  name: 'Logic Level Mismatch',
  description: 'A logic input sees a voltage outside its family limits.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const gate of ctx.componentsOfType(ComponentType.LogicGate)) {
      const family = String(gate.params.family ?? '74HC');
      const maxVcc = logicFamilyMaxVcc(family);
      if (maxVcc === undefined) continue;

      for (const pin of gate.pins) {
        if (pin.type !== PinType.Input || !pin.isConnected()) continue;
        const net = ctx.netOf(pin);
        if (!net) continue;

        const applied = net.potential ??
          ctx.findSupplyPath(net, { accept: n => n.potential !== undefined })?.potential;
        if (applied === undefined) continue;

        if (applied > maxVcc) {
          findings.push({
            message: `${pin.fullName}: driven to ${fmtV(applied)}, above the ${fmtV(maxVcc)} absolute maximum for the ${family} family. The input protection diodes will conduct and the part can be damaged.`,
            hint: `Add a level shifter or a divider between net "${net.name}" and ${pin.fullName}.`,
            components: [gate],
            nodes: [net.node],
            pins: [pin],
          });
        } else if (applied < -0.5) {
          findings.push({
            message: `${pin.fullName}: driven to ${fmtV(applied)}, below the negative input limit for the ${family} family.`,
            hint: `Keep ${pin.fullName} between 0V and ${fmtV(maxVcc)}.`,
            components: [gate],
            nodes: [net.node],
            pins: [pin],
          });
        }
      }
    }
    return findings;
  },
};

// ─────────────────────────────────────────────────────────────
// Transistors
// ─────────────────────────────────────────────────────────────

const CONTROL_PIN_LABEL: Record<string, string> = { B: 'Base', G: 'Gate' };
const TERMINAL_LABEL: Record<string, string> = {
  C: 'Collector', E: 'Emitter', D: 'Drain', S: 'Source',
};

export const transistorNoDrive: ERCRule = {
  key: 'transistorNoDrive',
  id: 'ERC_TRANSISTOR_NO_DRIVE',
  name: 'Transistor Control Pin Floating',
  description: 'A base or gate is unconnected, leaving the device in an undefined state.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const t of ctx.componentsIn(TRANSISTOR_TYPES)) {
      const control = t.pins.find(p => p.name === 'B' || p.name === 'G');
      if (!control) continue;
      const label = CONTROL_PIN_LABEL[control.name] ?? control.name;

      if (!control.isConnected()) {
        const isFet = FET_TYPES.has(t.type);
        findings.push({
          message: `${t.label}: ${label} is unconnected. The device has no control signal${isFet ? ' — a floating MOSFET gate picks up charge and switches unpredictably' : ' and cannot switch'}.`,
          hint: `Drive ${t.label}.${control.name}${isFet ? ', and add a gate pull resistor to define the off state' : ' through a base resistor'}.`,
          components: [t],
          pins: [control],
        });
        continue;
      }

      // Connected, but nothing on the net can move it.
      const net = ctx.netOf(control);
      if (!net) continue;
      const hasDriver = net.pins.some(p => p !== control &&
        (p.type === PinType.Output || p.type === PinType.PowerOut));
      if (hasDriver) continue;
      if (ctx.findSupplyPath(net, { exclude: new Set([t]) })) continue;

      findings.push({
        message: `${t.label}: ${label} sits on net "${net.name}", which has no driver and no path to a supply. The device state is undefined.`,
        hint: `Drive net "${net.name}" from a signal source or a bias network.`,
        components: [t],
        nodes: [net.node],
        pins: [control],
      });
    }
    return findings;
  },
};

export const transistorTerminalFloating: ERCRule = {
  key: 'transistorTerminalFloating',
  id: 'ERC_TRANSISTOR_TERMINAL_FLOATING',
  name: 'Transistor Terminal Floating',
  description: 'A collector, emitter, drain or source is unconnected.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const t of ctx.componentsIn(TRANSISTOR_TYPES)) {
      for (const pin of t.pins) {
        if (pin.name === 'B' || pin.name === 'G') continue;   // transistorNoDrive
        if (pin.isConnected()) continue;
        const label = TERMINAL_LABEL[pin.name] ?? pin.name;
        findings.push({
          message: `${t.label}: ${label} is unconnected. No current can flow through the device.`,
          hint: `Connect ${t.label}.${pin.name} into the load path.`,
          components: [t],
          pins: [pin],
        });
      }
    }
    return findings;
  },
};

export const baseResistorMissing: ERCRule = {
  key: 'baseResistorMissing',
  id: 'ERC_BJT_NO_BASE_RESISTOR',
  name: 'BJT Base Without Series Resistor',
  description: 'A BJT base is driven from a supply with nothing limiting base current.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const t of ctx.componentsIn(TRANSISTOR_TYPES)) {
      if (FET_TYPES.has(t.type)) continue;             // gates draw no DC current
      const base = t.pins.find(p => p.name === 'B');
      if (!base?.isConnected()) continue;
      const net = ctx.netOf(base);
      if (!net) continue;

      // Driven straight from a rail or an output on the same net.
      const directDriver = net.pins.find(p => p !== base &&
        (p.type === PinType.PowerOut || p.type === PinType.Output));
      if (!directDriver) {
        // Or reached through a chain that contains no resistance at all.
        const route = ctx.findSupplyPath(net, { exclude: new Set([t]) });
        if (!route || route.resistance > 0 || route.path.some(limitsCurrent)) continue;
        if (route.potential === 0) continue;          // a pull-down to ground is fine
      }

      const driverLabel = directDriver
        ? ctx.componentOf(directDriver)?.label ?? net.name
        : `net "${net.name}"`;
      findings.push({
        message: `${t.label}: Base is driven from ${driverLabel} with no series resistance. The base-emitter junction is a forward diode — base current is unlimited and the transistor will be destroyed.`,
        hint: `Insert a base resistor (typically 1kΩ–10kΩ) between ${driverLabel} and ${t.label}.B.`,
        components: [t],
        nodes: [net.node],
        pins: [base],
      });
    }
    return findings;
  },
};

export const gateResistorMissing: ERCRule = {
  key: 'gateResistorMissing',
  id: 'ERC_MOSFET_GATE_UNDEFINED',
  name: 'MOSFET Gate Without Defined Off-State',
  description: 'A MOSFET gate has no pull resistor to hold it off.',
  severity: { strict: 'warning', balanced: 'warning', relaxed: 'info' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const t of ctx.componentsIn(FET_TYPES)) {
      const gate = t.pins.find(p => p.name === 'G');
      if (!gate?.isConnected()) continue;            // unconnected → transistorNoDrive
      const net = ctx.netOf(gate);
      if (!net) continue;

      // A resistor on the gate net is taken as the pull-up/pull-down.
      const hasPullResistor = net.pins.some(p => {
        const comp = ctx.componentOf(p);
        return !!comp && comp.type === ComponentType.Resistor;
      });
      if (hasPullResistor) continue;

      // A rail or a push-pull output holds the gate at a defined level.
      const hardDriven = net.pins.some(p => p !== gate && p.type === PinType.PowerOut);
      if (hardDriven) continue;

      findings.push({
        message: `${t.label}: gate net "${net.name}" has no pull resistor. While the driver is high-impedance or unpowered, the gate floats and the MOSFET may turn on unintentionally.`,
        hint: `Add a gate pull-${t.params.transistorType === 'PMOS' ? 'up' : 'down'} resistor (typically 10kΩ–100kΩ) on net "${net.name}".`,
        components: [t],
        nodes: [net.node],
        pins: [gate],
      });
    }
    return findings;
  },
};

// ─────────────────────────────────────────────────────────────
// Op-amps
// ─────────────────────────────────────────────────────────────

export const opAmpOutputShorted: ERCRule = {
  key: 'opAmpOutputShorted',
  id: 'ERC_OPAMP_OUTPUT_SHORTED',
  name: 'Op-Amp Output Shorted',
  description: 'An op-amp output is tied to a supply rail or ground.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const op of ctx.componentsOfType(ComponentType.OpAmp)) {
      const out = op.pins.find(p => p.name === 'out');
      if (!out?.isConnected()) continue;
      const net = ctx.netOf(out);
      if (!net) continue;

      const rails = net.pins.filter(p => {
        if (p === out) return false;
        const comp = ctx.componentOf(p);
        return !!comp && (
          comp.type === ComponentType.Ground ||
          comp.type === ComponentType.PowerRail ||
          (comp.type === ComponentType.VoltageSource && p.name === 'positive')
        );
      });
      if (rails.length === 0) continue;

      const labels = rails.map(p => ctx.componentOf(p)!.label).join(', ');
      findings.push({
        message: `${op.label}: output is tied directly to ${labels}. The output stage is short-circuited whenever it drives away from that rail, exceeding its short-circuit current.`,
        hint: `Insert a series resistor between ${op.label}.out and ${labels}, or drive a load instead.`,
        components: [op, ...rails.map(p => ctx.componentOf(p)!)],
        nodes: [net.node],
        pins: [out, ...rails],
      });
    }
    return findings;
  },
};

export const opAmpNoFeedback: ERCRule = {
  key: 'opAmpNoFeedback',
  id: 'ERC_OPAMP_NO_FEEDBACK',
  name: 'Op-Amp Without Feedback',
  description: 'No path connects the op-amp output back to its inverting input.',
  severity: { strict: 'warning', balanced: 'warning', relaxed: 'info' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const op of ctx.componentsOfType(ComponentType.OpAmp)) {
      const out = op.pins.find(p => p.name === 'out');
      const inN = op.pins.find(p => p.name === 'inN');
      if (!out?.isConnected() || !inN?.isConnected()) continue;

      const outNet = ctx.netOf(out);
      const inNet = ctx.netOf(inN);
      if (!outNet || !inNet) continue;
      if (outNet.id === inNet.id) continue;                    // unity-gain buffer

      const feedback = ctx.findResistivePath(outNet, inNet, new Set([op]), 'either');
      if (feedback) continue;

      findings.push({
        message: `${op.label}: no feedback path from out back to inN. The amplifier runs open-loop at full gain and its output will sit at one of the supply rails.`,
        hint: `Add a feedback network between ${op.label}.out and ${op.label}.inN, or use this stage deliberately as a comparator.`,
        components: [op],
        nodes: [outNet.node, inNet.node],
        pins: [out, inN],
      });
    }
    return findings;
  },
};

export const missingDecoupling: ERCRule = {
  key: 'missingDecoupling',
  id: 'ERC_MISSING_DECOUPLING',
  name: 'Missing Decoupling Capacitor',
  description: 'An IC supply pin has no local bypass capacitor.',
  severity: { strict: 'warning', balanced: 'info', relaxed: 'info' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const ic of ctx.componentsIn(IC_TYPES)) {
      const supplyPins = ic.pins.filter(p => p.type === PinType.PowerIn && p.isConnected());
      if (supplyPins.length === 0) continue;

      const undecoupled: Pin[] = [];
      for (const pin of supplyPins) {
        const net = ctx.netOf(pin);
        if (!net) continue;
        const hasCap = net.pins.some(p => {
          const comp = ctx.componentOf(p);
          return !!comp && comp.type === ComponentType.Capacitor;
        });
        if (!hasCap) undecoupled.push(pin);
      }
      if (undecoupled.length === 0) continue;

      findings.push({
        message: `${ic.label}: supply pin(s) ${undecoupled.map(p => p.name).join(', ')} have no local decoupling capacitor. Switching current will modulate the rail.`,
        hint: `Add a 100nF capacitor from each ${ic.label} supply pin to ground.`,
        components: [ic],
        pins: undecoupled,
      });
    }
    return findings;
  },
};

export const DEVICE_RULES: ERCRule[] = [
  reversePolarity,
  noCurrentLimit,
  currentExceeded,
  voltageExceeded,
  powerDissipation,
  fanOut,
  logicLevelMismatch,
  transistorNoDrive,
  transistorTerminalFloating,
  baseResistorMissing,
  gateResistorMissing,
  opAmpOutputShorted,
  opAmpNoFeedback,
  missingDecoupling,
];
