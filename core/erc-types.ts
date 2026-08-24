/**
 * WireScript ERC — Shared type contracts
 *
 * Kept in its own module so the engine (`erc.ts`) and the rule modules can
 * both depend on it without a cycle.
 */

import { Component } from './Component';
import { Node } from './Node';
import { Pin } from './Pin';
import { ERCContext } from './erc-model';

// ─────────────────────────────────────────────────────────────
// Severity
// ─────────────────────────────────────────────────────────────

/**
 * `error`   — the circuit will not work, or hardware will be damaged.
 * `warning` — the circuit may misbehave, or violates a datasheet limit.
 * `info`    — design-quality observation; nothing is wrong.
 */
export type ERCSeverity = 'error' | 'warning' | 'info';

/** A severity override; `off` disables the rule entirely. */
export type ERCSeverityOverride = ERCSeverity | 'off';

// ─────────────────────────────────────────────────────────────
// Rule identity
// ─────────────────────────────────────────────────────────────

/**
 * Every rule the engine knows about, keyed by its short name.
 * The `ERC_*` id used in messages is derived from this key.
 */
export type ERCRuleKey =
  // ── Topology & connectivity ──
  | 'emptyCircuit'
  | 'noGround'
  | 'unconnectedPin'
  | 'danglingNet'
  | 'duplicateRefDes'
  | 'isolatedSection'
  | 'noConnectPinUsed'
  | 'invalidValue'
  // ── Power & drive ──
  | 'shortCircuit'
  | 'supplyShort'
  | 'powerConflict'
  | 'outputConflict'
  | 'missingPowerPin'
  | 'powerInputNotDriven'
  | 'floatingInput'
  | 'noLoad'
  | 'driverConflict'
  // ── Device physics ──
  | 'reversePolarity'
  | 'noCurrentLimit'
  | 'currentExceeded'
  | 'voltageExceeded'
  | 'powerDissipation'
  | 'fanOut'
  | 'logicLevelMismatch'
  | 'transistorNoDrive'
  | 'transistorTerminalFloating'
  | 'baseResistorMissing'
  | 'gateResistorMissing'
  | 'opAmpOutputShorted'
  | 'opAmpNoFeedback'
  | 'missingDecoupling';

/** Enable/disable individual rules. Omitted rules keep their default state. */
export type ERCRuleSet = Partial<Record<ERCRuleKey, boolean>>;

/** Per-rule severity overrides, keyed by rule key or by `ERC_*` id. */
export type ERCSeverityMap = Partial<Record<string, ERCSeverityOverride>>;

// ─────────────────────────────────────────────────────────────
// Violations
// ─────────────────────────────────────────────────────────────

export interface ERCViolation {
  /** Stable rule identifier, e.g. `"ERC_SHORT_CIRCUIT"`. */
  ruleId: string;
  /** Short rule key, e.g. `"shortCircuit"`. */
  ruleKey: ERCRuleKey;
  /** Human-readable rule name. */
  ruleName: string;
  severity: ERCSeverity;
  /** Diagnostic message describing this specific occurrence. */
  message: string;
  /** Concrete suggestion for fixing it, when one applies. */
  hint?: string;
  components: Component[];
  nodes: Node[];
  pins: Pin[];
}

/** What a rule returns — severity is applied afterwards by the engine. */
export interface ERCFinding {
  message: string;
  hint?: string;
  components?: Component[];
  nodes?: Node[];
  pins?: Pin[];
  /**
   * Lets a rule escalate or relax a single occurrence
   * (e.g. a marginal overload vs. a catastrophic one).
   */
  severity?: ERCSeverity;
}

// ─────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────

/**
 * How strict the default severities are.
 *
 * - `strict`   — every rule that indicates a real defect reports `error`.
 * - `balanced` — the default: hard faults are errors, spec/limit violations
 *                are errors, design-quality notes stay warnings/info.
 * - `relaxed`  — only unambiguous, damage-causing faults are errors.
 */
export type ERCPreset = 'strict' | 'balanced' | 'relaxed';

export interface ERCOptions {
  /** Enable/disable individual rules. */
  rules?: ERCRuleSet;
  /** Override severity per rule (`'off'` disables). */
  severity?: ERCSeverityMap;
  /** Severity profile applied before `severity` overrides. Default `balanced`. */
  preset?: ERCPreset;
  /** Max logic inputs a gate output may drive. Default `10` (74HC). */
  fanOutLimit?: number;
  /** Assumed resistor power rating in watts. Default `0.25`. */
  resistorPowerRating?: number;
  /** Supply assumed for logic families when no rail is attached. Default `5`. */
  defaultLogicSupply?: number;
  /** Fallback max forward current for diodes with no rating. Default `0.02` A. */
  defaultDiodeCurrent?: number;
}

/** Options with every default filled in. */
export interface ResolvedERCOptions {
  fanOutLimit: number;
  resistorPowerRating: number;
  defaultLogicSupply: number;
  defaultDiodeCurrent: number;
  preset: ERCPreset;
}

// ─────────────────────────────────────────────────────────────
// Rule definition
// ─────────────────────────────────────────────────────────────

export interface ERCRule {
  key: ERCRuleKey;
  /** Stable public id used in messages and severity overrides. */
  id: string;
  name: string;
  /** One-line explanation of what the rule catches. */
  description: string;
  /** Severity per preset. */
  severity: Record<ERCPreset, ERCSeverityOverride>;
  check(ctx: ERCContext, options: ResolvedERCOptions): ERCFinding[];
}
