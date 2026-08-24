/**
 * WireScript ERC — Topology, connectivity and power-distribution rules.
 *
 * These rules look at how the circuit is *wired*, independent of what the
 * individual devices are. Device physics lives in `erc-rules-device.ts`.
 */

import { Component } from './Component';
import { Pin } from './Pin';
import {
  ERCContext,
  Net,
  SUPPLY_TYPES,
  isDriver,
  limitsCurrent,
  seriesElementOf,
} from './erc-model';
import { ERCFinding, ERCRule } from './erc-types';
import { ComponentType, PinType } from './types';

const fmtV = (v: number) => `${Number(v.toFixed(3))}V`;

/** The potential a supply component asserts onto a net it is attached to. */
function railPotential(component: Component, net: Net): number | undefined {
  switch (component.type) {
    case ComponentType.PowerRail:
      return component.params.value;
    case ComponentType.VoltageSource: {
      const pin = net.pins.find(p => p.component === component);
      return pin?.name === 'positive' ? component.params.value : 0;
    }
    default:
      return undefined;
  }
}

/** Pins that legitimately sit alone on a net (a reference symbol, a test point). */
function isSingleTerminalSymbol(component: Component): boolean {
  return component.type === ComponentType.Ground ||
    component.type === ComponentType.PowerRail;
}

// ─────────────────────────────────────────────────────────────
// Topology
// ─────────────────────────────────────────────────────────────

export const emptyCircuit: ERCRule = {
  key: 'emptyCircuit',
  id: 'ERC_EMPTY_CIRCUIT',
  name: 'Empty Circuit',
  description: 'The schematic contains no components.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    if (ctx.schematic.components.length > 0) return [];
    return [{
      message: `Circuit "${ctx.schematic.name}" contains no components.`,
      hint: 'Add components with Circuit(...) or schematic.addComponent().',
    }];
  },
};

export const noGround: ERCRule = {
  key: 'noGround',
  id: 'ERC_NO_GROUND',
  name: 'No Ground Reference',
  description: 'The circuit has no 0V reference, so all node voltages are undefined.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    if (ctx.schematic.components.length === 0) return [];
    if (ctx.hasGround) return [];
    return [{
      message: 'Circuit has no ground (GND) reference. All node voltages are undefined.',
      hint: 'Add a GND() component and connect it to the supply return path.',
    }];
  },
};

export const unconnectedPin: ERCRule = {
  key: 'unconnectedPin',
  id: 'ERC_UNCONNECTED_PIN',
  name: 'Unconnected Pin',
  description: 'A component terminal is not attached to any net.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const pin of ctx.unconnectedPins) {
      const comp = ctx.componentOf(pin);
      if (!comp) continue;
      if (pin.type === PinType.NoConnect) continue;
      findings.push({
        message: `${pin.fullName}: pin is not connected to any net. The circuit is incomplete — no current can flow through this terminal.`,
        hint: `Wire ${pin.fullName} to a net, or remove ${comp.label}.`,
        components: [comp],
        pins: [pin],
      });
    }
    return findings;
  },
};

export const danglingNet: ERCRule = {
  key: 'danglingNet',
  id: 'ERC_DANGLING_NET',
  name: 'Dangling Net',
  description: 'A net has only one pin on it, so no current can flow.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const net of ctx.nets) {
      if (net.pins.length !== 1) continue;
      const pin = net.pins[0];
      const comp = ctx.componentOf(pin);
      if (!comp) continue;
      // A lone GND or VCC symbol on its own net is how a rail is declared.
      if (isSingleTerminalSymbol(comp)) continue;
      findings.push({
        message: `Net "${net.name}": only ${pin.fullName} is connected. A net needs at least two terminals to carry current.`,
        hint: `Connect another terminal to net "${net.name}" or remove the wire.`,
        components: [comp],
        nodes: [net.node],
        pins: [pin],
      });
    }
    return findings;
  },
};

export const duplicateRefDes: ERCRule = {
  key: 'duplicateRefDes',
  id: 'ERC_DUPLICATE_REFDES',
  name: 'Duplicate Reference Designator',
  description: 'Two components share the same label, which breaks netlist export.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const byLabel = new Map<string, Component[]>();
    for (const comp of ctx.schematic.components) {
      const list = byLabel.get(comp.label) ?? [];
      list.push(comp);
      byLabel.set(comp.label, list);
    }
    const findings: ERCFinding[] = [];
    for (const [label, comps] of byLabel) {
      if (comps.length < 2) continue;
      findings.push({
        message: `Reference designator "${label}" is used by ${comps.length} components. Netlist export cannot distinguish them.`,
        hint: 'Give each component a unique label.',
        components: comps,
      });
    }
    return findings;
  },
};

export const isolatedSection: ERCRule = {
  key: 'isolatedSection',
  id: 'ERC_ISOLATED_SECTION',
  name: 'Isolated Circuit Section',
  description: 'A group of components has no connection to the ground reference.',
  severity: { strict: 'error', balanced: 'warning', relaxed: 'info' },
  check(ctx) {
    if (!ctx.hasGround) return [];        // ERC_NO_GROUND already covers this
    if (ctx.schematic.components.length === 0) return [];

    // Flood the component graph outward from every ground net.
    const reached = new Set<Component>();
    const queue: Net[] = ctx.groundNets.slice();
    const visitedNets = new Set<string>(queue.map(n => n.id));

    while (queue.length > 0) {
      const net = queue.shift()!;
      for (const pin of net.pins) {
        const comp = ctx.componentOf(pin);
        if (!comp) continue;
        reached.add(comp);
        for (const other of ctx.otherPinsOf(pin)) {
          const nextNet = ctx.netOf(other);
          if (!nextNet || visitedNets.has(nextNet.id)) continue;
          visitedNets.add(nextNet.id);
          queue.push(nextNet);
        }
      }
    }

    const orphans = ctx.schematic.components.filter(c => !reached.has(c));
    if (orphans.length === 0) return [];
    const labels = orphans.map(c => c.label).join(', ');
    return [{
      message: `${orphans.length} component(s) have no connection to ground: ${labels}. This section is electrically isolated and cannot operate.`,
      hint: 'Connect this section to the circuit ground, or remove it.',
      components: orphans,
    }];
  },
};

export const noConnectPinUsed: ERCRule = {
  key: 'noConnectPinUsed',
  id: 'ERC_NC_PIN_CONNECTED',
  name: 'No-Connect Pin Wired',
  description: 'A pin marked no-connect has been wired to a net.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const net of ctx.nets) {
      for (const pin of net.pins) {
        if (pin.type !== PinType.NoConnect) continue;
        const comp = ctx.componentOf(pin);
        if (!comp) continue;
        findings.push({
          message: `${pin.fullName}: pin is marked no-connect but is wired to net "${net.name}".`,
          hint: `Leave ${pin.fullName} unconnected.`,
          components: [comp],
          nodes: [net.node],
          pins: [pin],
        });
      }
    }
    return findings;
  },
};

export const invalidValue: ERCRule = {
  key: 'invalidValue',
  id: 'ERC_INVALID_VALUE',
  name: 'Invalid Component Value',
  description: 'A component parameter is outside its physically valid range.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const comp of ctx.schematic.components) {
      for (const message of comp.validate()) {
        findings.push({
          message: `${comp.label}: ${message}`,
          components: [comp],
        });
      }
    }
    return findings;
  },
};

// ─────────────────────────────────────────────────────────────
// Power distribution & drive
// ─────────────────────────────────────────────────────────────

export const shortCircuit: ERCRule = {
  key: 'shortCircuit',
  id: 'ERC_SHORT_CIRCUIT',
  name: 'Short Circuit',
  description: 'A source is shorted across its own terminals with no current limiting.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    const sources = ctx.componentsOfType(
      ComponentType.VoltageSource,
      ComponentType.CurrentSource,
    );

    for (const source of sources) {
      const posPin = source.pins.find(p => p.name === 'positive');
      const negPin = source.pins.find(p => p.name === 'negative');
      if (!posPin?.node || !negPin?.node) continue;

      const posNet = ctx.netOf(posPin);
      const negNet = ctx.netOf(negPin);
      if (!posNet || !negNet) continue;

      // Both terminals on the same net — a bolted short.
      if (posNet.id === negNet.id) {
        findings.push({
          message: `${source.label}: positive and negative terminals are on the same net ("${posNet.name}"). The source is short-circuited — current is limited only by the source itself.`,
          hint: `Insert a load between ${source.label}.positive and ${source.label}.negative.`,
          components: [source],
          nodes: [posNet.node],
          pins: [posPin, negPin],
        });
        continue;
      }

      // A route back to the negative terminal that never passes through
      // anything that limits current.
      const route = ctx.findResistivePath(posNet, negNet, new Set([source]));
      if (route && route.resistance === 0 && route.path.every(c => !limitsCurrent(c))) {
        const via = route.path.map(c => c.label).join(' → ');
        findings.push({
          message: `${source.label}: positive terminal returns to negative through ${via || 'a direct connection'} with zero series resistance. This is a short circuit.`,
          hint: 'Add a series resistor, or check the wiring of this loop.',
          components: [source, ...route.path],
          nodes: [posNet.node, negNet.node],
          pins: [posPin, negPin],
        });
      }
    }
    return findings;
  },
};

export const supplyShort: ERCRule = {
  key: 'supplyShort',
  id: 'ERC_SUPPLY_SHORT',
  name: 'Supply Shorted to Ground',
  description: 'A power rail reaches ground with no impedance in between.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    const seen = new Set<string>();

    for (const net of ctx.nets) {
      // A net carrying both a rail and a ground reference is a bolted short.
      // `potential` is forced to 0 by the ground symbol, so the rail voltage
      // is read from `suppliedPotential`.
      if (net.isGround) {
        const rails = net.pins
          .map(p => ctx.componentOf(p))
          .filter((c): c is Component =>
            !!c && SUPPLY_TYPES.has(c.type) && railPotential(c, net) !== 0);
        if (rails.length === 0) continue;
        const key = `direct:${net.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const shown = rails
          .map(r => `${r.label} (${fmtV(railPotential(r, net) ?? 0)})`)
          .join(', ');
        findings.push({
          message: `Net "${net.name}": ${shown} is connected directly to the ground reference. The supply is shorted to 0V — this draws unlimited current.`,
          hint: 'Separate the rail from the ground net and insert the intended load.',
          components: rails,
          nodes: [net.node],
          pins: net.pins,
        });
        continue;
      }

      if (net.potential === undefined || net.potential === 0) continue;

      // A zero-resistance route from the rail to ground.
      const route = ctx.findGroundPath(net);
      if (!route || route.path.length === 0) continue;
      if (route.resistance !== 0) continue;
      if (route.path.some(c => limitsCurrent(c))) continue;

      const key = `path:${net.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const via = route.path.map(c => `${c.label} (${c.toString()})`).join(' → ');
      findings.push({
        message: `Net "${net.name}" (${fmtV(net.potential)}) reaches ground through ${via} with zero series resistance. This shorts the supply.`,
        hint: 'Add a current-limiting resistor in this path.',
        components: route.path,
        nodes: [net.node, route.target.node],
      });
    }
    return findings;
  },
};

export const powerConflict: ERCRule = {
  key: 'powerConflict',
  id: 'ERC_POWER_CONFLICT',
  name: 'Power Supply Conflict',
  description: 'Supplies at different potentials are tied to the same net.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const net of ctx.nets) {
      const supplyPins: Pin[] = [];
      const potentials: number[] = [];

      for (const pin of net.pins) {
        const comp = ctx.componentOf(pin);
        if (!comp) continue;
        if (comp.type === ComponentType.PowerRail) {
          supplyPins.push(pin);
          potentials.push(comp.params.value);
        } else if (comp.type === ComponentType.VoltageSource) {
          supplyPins.push(pin);
          potentials.push(pin.name === 'positive' ? comp.params.value : 0);
        } else if (comp.type === ComponentType.Ground) {
          supplyPins.push(pin);
          potentials.push(0);
        }
      }

      if (supplyPins.length < 2) continue;
      const unique = [...new Set(potentials)];
      if (unique.length < 2) continue;

      const labels = supplyPins
        .map((p, i) => `${ctx.componentOf(p)!.label}(${fmtV(potentials[i])})`)
        .join(', ');
      findings.push({
        message: `Net "${net.name}": supplies at different potentials are tied together: ${labels}. They will fight each other and draw unlimited current.`,
        hint: 'Separate the rails, or interpose a regulator/diode-OR between them.',
        components: supplyPins.map(p => ctx.componentOf(p)!),
        nodes: [net.node],
        pins: supplyPins,
      });
    }
    return findings;
  },
};

export const outputConflict: ERCRule = {
  key: 'outputConflict',
  id: 'ERC_OUTPUT_CONFLICT',
  name: 'Output Driver Conflict',
  description: 'Two active outputs drive the same net.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const net of ctx.nets) {
      // Push-pull outputs only: open-collector and tri-state pins are
      // designed to share a net.
      const outputs = net.pins.filter(p => p.type === PinType.Output);
      const supplies = net.pins.filter(p => {
        const comp = ctx.componentOf(p);
        return !!comp && (SUPPLY_TYPES.has(comp.type) || comp.type === ComponentType.Ground);
      });

      if (outputs.length >= 2) {
        const labels = outputs.map(p => p.fullName).join(', ');
        findings.push({
          message: `Net "${net.name}": ${outputs.length} push-pull outputs drive the same net (${labels}). If they disagree, one sources current straight into the other — bus contention can destroy both.`,
          hint: 'Drive the net from one output, or use open-collector/tri-state outputs with a pull-up.',
          components: outputs.map(p => ctx.componentOf(p)!).filter(Boolean),
          nodes: [net.node],
          pins: outputs,
        });
      } else if (outputs.length === 1 && supplies.length > 0) {
        const driver = outputs[0];
        const supplyLabels = supplies.map(p => ctx.componentOf(p)!.label).join(', ');
        findings.push({
          message: `Net "${net.name}": output ${driver.fullName} is tied directly to supply/reference ${supplyLabels}. The output will be short-circuited whenever it drives the opposite level.`,
          hint: `Insert a series resistor, or drive a load from ${driver.fullName} instead.`,
          components: [ctx.componentOf(driver)!, ...supplies.map(p => ctx.componentOf(p)!)],
          nodes: [net.node],
          pins: [driver, ...supplies],
        });
      }
    }
    return findings;
  },
};

export const missingPowerPin: ERCRule = {
  key: 'missingPowerPin',
  id: 'ERC_MISSING_POWER_PIN',
  name: 'Missing Power Connection',
  description: 'A device supply pin is left unconnected.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'error' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const comp of ctx.schematic.components) {
      for (const pin of comp.pins) {
        if (pin.type !== PinType.PowerIn) continue;
        if (pin.isConnected()) continue;
        findings.push({
          message: `${comp.label}: supply pin ${pin.name} is not connected. The device is unpowered and will not operate.`,
          hint: `Connect ${pin.fullName} to a power rail.`,
          components: [comp],
          pins: [pin],
        });
      }
    }
    return findings;
  },
};

export const powerInputNotDriven: ERCRule = {
  key: 'powerInputNotDriven',
  id: 'ERC_POWER_INPUT_NOT_DRIVEN',
  name: 'Power Input Not Driven',
  description: 'A supply pin sits on a net with no source feeding it.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const net of ctx.nets) {
      const powerInputs = net.pins.filter(p => p.type === PinType.PowerIn);
      if (powerInputs.length === 0) continue;

      const hasLocalSupply = net.pins.some(p => p.type === PinType.PowerOut);
      if (hasLocalSupply) continue;
      // A rail reached through passives still counts as powered.
      if (ctx.findSupplyPath(net, { accept: n => n.potential !== undefined })) continue;

      const labels = powerInputs.map(p => p.fullName).join(', ');
      findings.push({
        message: `Net "${net.name}": supply pin(s) ${labels} sit on a net with no power source. The device has no supply voltage.`,
        hint: `Connect net "${net.name}" to a VCC()/DC() rail.`,
        components: powerInputs.map(p => ctx.componentOf(p)!).filter(Boolean),
        nodes: [net.node],
        pins: powerInputs,
      });
    }
    return findings;
  },
};

export const floatingInput: ERCRule = {
  key: 'floatingInput',
  id: 'ERC_FLOATING_INPUT',
  name: 'Floating Input',
  description: 'A signal input is unconnected, or sits on a net with no driver.',
  severity: { strict: 'error', balanced: 'error', relaxed: 'warning' },
  check(ctx) {
    const findings: ERCFinding[] = [];

    for (const comp of ctx.schematic.components) {
      for (const pin of comp.pins) {
        if (pin.type !== PinType.Input) continue;

        // Case 1: the input is wired to nothing at all.
        if (!pin.isConnected()) {
          findings.push({
            message: `${pin.fullName}: input pin is unconnected. A floating input has an undefined level, oscillates with noise, and on CMOS parts draws excessive supply current.`,
            hint: `Tie ${pin.fullName} to a driver, or to VCC/GND through a pull resistor.`,
            components: [comp],
            pins: [pin],
          });
          continue;
        }

        // Case 2: the input is wired, but nothing on its net drives it.
        const net = ctx.netOf(pin);
        if (!net) continue;
        if (net.pins.some(p => p !== pin && isDriver(p))) continue;
        // A pull-up/pull-down to a rail is a valid way to define the level.
        if (ctx.findSupplyPath(net, { accept: n => n.potential !== undefined })) continue;

        findings.push({
          message: `${pin.fullName}: net "${net.name}" has no driver and no path to a supply. The input level is undefined.`,
          hint: `Drive net "${net.name}" from an output, or add a pull-up/pull-down resistor.`,
          components: [comp],
          nodes: [net.node],
          pins: [pin],
        });
      }
    }
    return findings;
  },
};

export const noLoad: ERCRule = {
  key: 'noLoad',
  id: 'ERC_NO_LOAD',
  name: 'Source With No Return Path',
  description: 'A source cannot deliver current because its loop is not closed.',
  severity: { strict: 'error', balanced: 'warning', relaxed: 'info' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const source of ctx.componentsOfType(
      ComponentType.VoltageSource,
      ComponentType.CurrentSource,
    )) {
      const posPin = source.pins.find(p => p.name === 'positive');
      const negPin = source.pins.find(p => p.name === 'negative');
      if (!posPin?.isConnected() || !negPin?.isConnected()) continue;

      const posNet = ctx.netOf(posPin);
      const negNet = ctx.netOf(negPin);
      if (!posNet || !negNet || posNet.id === negNet.id) continue;

      // Traverse through transistors and ICs too: a load switched by a
      // transistor is still a load, even though the device may be off.
      if (ctx.hasConductivePath(posNet, negNet, new Set([source]))) continue;

      // The DC loop is open. Distinguish "closed at AC through a capacitor"
      // from "simply not wired up" — only the second is a mistake.
      const blockedByCap = ctx.hasConductivePath(
        posNet, negNet, new Set([source]), 'either', true,
      );
      const isAC = source.params.sourceType === 'ac';

      findings.push({
        message: blockedByCap
          ? `${source.label}: no DC return path to its negative terminal — the loop is closed only through a capacitor. There is no DC operating point.`
          : `${source.label}: no closed path from positive back to negative. The source drives nothing.`,
        // AC coupled through a series capacitor is the intended topology, not a
        // defect — say so, but do not fail the circuit over it.
        severity: blockedByCap && isAC ? 'info' : undefined,
        hint: blockedByCap && isAC
          ? `Expected for AC coupling. Add a DC bias path if ${source.label} needs a DC operating point.`
          : `Complete the loop from ${source.label}.positive back to ${source.label}.negative.`,
        components: [source],
        nodes: [posNet.node, negNet.node],
        pins: [posPin, negPin],
      });
    }
    return findings;
  },
};

export const driverConflict: ERCRule = {
  key: 'driverConflict',
  id: 'ERC_DRIVER_CONFLICT',
  name: 'Analog/Digital Interface',
  description: 'An analog source drives a digital input with no level translation.',
  severity: { strict: 'warning', balanced: 'warning', relaxed: 'info' },
  check(ctx) {
    const findings: ERCFinding[] = [];
    for (const net of ctx.nets) {
      const analogDrivers = net.pins.filter(p => {
        const comp = ctx.componentOf(p);
        if (!comp) return false;
        return isDriver(p) &&
          (comp.type === ComponentType.OpAmp || comp.type === ComponentType.CurrentSource);
      });
      const digitalInputs = net.pins.filter(p => {
        const comp = ctx.componentOf(p);
        return !!comp && comp.type === ComponentType.LogicGate && p.type === PinType.Input;
      });
      if (analogDrivers.length === 0 || digitalInputs.length === 0) continue;

      findings.push({
        message: `Net "${net.name}": analog output ${analogDrivers.map(p => p.fullName).join(', ')} drives digital input ${digitalInputs.map(p => p.fullName).join(', ')} directly. Slow or intermediate levels put the logic input in its forbidden region.`,
        hint: 'Add a comparator, Schmitt-trigger buffer, or level shifter.',
        components: [...analogDrivers, ...digitalInputs]
          .map(p => ctx.componentOf(p)!)
          .filter(Boolean),
        nodes: [net.node],
        pins: [...analogDrivers, ...digitalInputs],
      });
    }
    return findings;
  },
};

export const TOPOLOGY_RULES: ERCRule[] = [
  emptyCircuit,
  noGround,
  unconnectedPin,
  danglingNet,
  duplicateRefDes,
  isolatedSection,
  noConnectPinUsed,
  invalidValue,
  shortCircuit,
  supplyShort,
  powerConflict,
  outputConflict,
  missingPowerPin,
  powerInputNotDriven,
  floatingInput,
  noLoad,
  driverConflict,
];
