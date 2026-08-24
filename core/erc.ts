/**
 * WireScript ERC — Electrical Rule Check
 *
 * Statically validates circuit topology and electrical constraints without
 * running a SPICE simulation.
 *
 * Severity levels:
 *   error   — the circuit will not work, or hardware will be damaged
 *   warning — may misbehave, or violates a datasheet limit
 *   info    — design-quality observation
 *
 * Usage:
 *   import { runERC } from '@ssevindikx/wirescript';
 *   const result = runERC(schematic);
 *   console.log(result.report());
 */

import { Schematic } from './Schematic';
import { ERCContext } from './erc-model';
import { DEVICE_RULES } from './erc-rules-device';
import { TOPOLOGY_RULES } from './erc-rules-topology';
import {
  ERCFinding,
  ERCOptions,
  ERCPreset,
  ERCRule,
  ERCRuleKey,
  ERCRuleSet,
  ERCSeverity,
  ERCSeverityOverride,
  ERCViolation,
  ResolvedERCOptions,
} from './erc-types';

export type {
  ERCFinding,
  ERCOptions,
  ERCPreset,
  ERCRule,
  ERCRuleKey,
  ERCRuleSet,
  ERCSeverity,
  ERCSeverityMap,
  ERCSeverityOverride,
  ERCViolation,
  ResolvedERCOptions,
} from './erc-types';

export {
  ERCContext,
  type Net,
  type NetKind,
  type SupplyPath,
  type SeriesElement,
  seriesElementOf,
  limitsCurrent,
} from './erc-model';

// ─────────────────────────────────────────────────────────────
// Rule registry
// ─────────────────────────────────────────────────────────────

/** Every rule the ERC engine knows about, in report order. */
export const ERC_RULES: readonly ERCRule[] = Object.freeze([
  ...TOPOLOGY_RULES,
  ...DEVICE_RULES,
]);

const RULES_BY_KEY = new Map<string, ERCRule>();
for (const rule of ERC_RULES) {
  RULES_BY_KEY.set(rule.key, rule);
  RULES_BY_KEY.set(rule.id, rule);
}

/** Look up a rule by its key (`'shortCircuit'`) or id (`'ERC_SHORT_CIRCUIT'`). */
export function getERCRule(keyOrId: string): ERCRule | undefined {
  return RULES_BY_KEY.get(keyOrId);
}

/** Machine-readable catalogue of every rule, for docs and tooling. */
export function listERCRules(): Array<{
  key: ERCRuleKey;
  id: string;
  name: string;
  description: string;
  severity: Record<ERCPreset, ERCSeverityOverride>;
}> {
  return ERC_RULES.map(r => ({
    key: r.key,
    id: r.id,
    name: r.name,
    description: r.description,
    severity: { ...r.severity },
  }));
}

// ─────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<ERCSeverity, string> = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
};

const SEVERITY_ORDER: Record<ERCSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export class ERCResult {
  readonly violations: ERCViolation[];
  /** Options actually used for this run, with defaults resolved. */
  readonly options: ResolvedERCOptions;

  constructor(violations: ERCViolation[], options?: ResolvedERCOptions) {
    this.violations = violations;
    this.options = options ?? {
      fanOutLimit: 10,
      resistorPowerRating: 0.25,
      defaultLogicSupply: 5,
      defaultDiodeCurrent: 0.02,
      preset: 'balanced',
    };
  }

  /** True when no `error`-severity violation was reported. */
  get passed(): boolean {
    return this.errors.length === 0;
  }

  /** True when there is nothing to report at all. */
  get clean(): boolean {
    return this.violations.length === 0;
  }

  get errors(): ERCViolation[] {
    return this.violations.filter(v => v.severity === 'error');
  }

  get warnings(): ERCViolation[] {
    return this.violations.filter(v => v.severity === 'warning');
  }

  get infos(): ERCViolation[] {
    return this.violations.filter(v => v.severity === 'info');
  }

  /** All violations of one rule, by key or `ERC_*` id. */
  byRule(keyOrId: string): ERCViolation[] {
    return this.violations.filter(
      v => v.ruleKey === keyOrId || v.ruleId === keyOrId,
    );
  }

  /** True when the named rule reported at least one violation. */
  has(keyOrId: string): boolean {
    return this.byRule(keyOrId).length > 0;
  }

  /** Counts by severity. */
  get counts(): Record<ERCSeverity, number> {
    return {
      error: this.errors.length,
      warning: this.warnings.length,
      info: this.infos.length,
    };
  }

  /** One-line-per-violation summary. */
  summary(): string {
    if (this.violations.length === 0) {
      return '✅ ERC passed — no violations found.';
    }
    const lines: string[] = [
      `ERC Result: ${this.errors.length} error(s), ${this.warnings.length} warning(s), ${this.infos.length} info(s)`,
      '',
    ];
    for (const v of this.violations) {
      lines.push(`${SEVERITY_ICON[v.severity]} [${v.ruleId}] ${v.message}`);
    }
    return lines.join('\n');
  }

  /** Verbose report including fix hints, grouped by severity. */
  report(): string {
    if (this.violations.length === 0) {
      return '✅ ERC passed — no violations found.';
    }
    const lines: string[] = [
      `ERC Result: ${this.errors.length} error(s), ${this.warnings.length} warning(s), ${this.infos.length} info(s)`,
    ];
    for (const severity of ['error', 'warning', 'info'] as ERCSeverity[]) {
      const group = this.violations.filter(v => v.severity === severity);
      if (group.length === 0) continue;
      lines.push('', `${SEVERITY_ICON[severity]} ${severity.toUpperCase()}S (${group.length})`);
      for (const v of group) {
        lines.push(`  [${v.ruleId}] ${v.message}`);
        if (v.hint) lines.push(`      ↳ ${v.hint}`);
      }
    }
    return lines.join('\n');
  }

  /** Plain-object form, for JSON output and tooling. */
  toJSON(): {
    passed: boolean;
    counts: Record<ERCSeverity, number>;
    violations: Array<{
      ruleId: string;
      ruleKey: string;
      ruleName: string;
      severity: ERCSeverity;
      message: string;
      hint?: string;
      components: string[];
      nodes: string[];
      pins: string[];
    }>;
  } {
    return {
      passed: this.passed,
      counts: this.counts,
      violations: this.violations.map(v => ({
        ruleId: v.ruleId,
        ruleKey: v.ruleKey,
        ruleName: v.ruleName,
        severity: v.severity,
        message: v.message,
        ...(v.hint ? { hint: v.hint } : {}),
        components: v.components.map(c => c.label),
        nodes: v.nodes.map(n => n.name ?? n.id),
        pins: v.pins.map(p => p.fullName),
      })),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────

function resolveOptions(options: ERCOptions): ResolvedERCOptions {
  return {
    fanOutLimit: options.fanOutLimit ?? 10,
    resistorPowerRating: options.resistorPowerRating ?? 0.25,
    defaultLogicSupply: options.defaultLogicSupply ?? 5,
    defaultDiodeCurrent: options.defaultDiodeCurrent ?? 0.02,
    preset: options.preset ?? 'balanced',
  };
}

/**
 * Decide the severity for a rule, or `null` when it should not run.
 *
 * Precedence: explicit `severity` override → `rules` on/off flag → preset.
 */
function resolveSeverity(
  rule: ERCRule,
  preset: ERCPreset,
  ruleSet: ERCRuleSet | undefined,
  severityMap: ERCOptions['severity'],
): ERCSeverity | null {
  const override = severityMap?.[rule.key] ?? severityMap?.[rule.id];
  if (override !== undefined) {
    return override === 'off' ? null : override;
  }

  const enabled = ruleSet?.[rule.key];
  if (enabled === false) return null;

  const presetSeverity = rule.severity[preset];
  if (presetSeverity === 'off') {
    // An explicit `true` in `rules` re-enables a rule the preset turned off.
    return enabled === true ? rule.severity.balanced as ERCSeverity : null;
  }
  return presetSeverity;
}

function toViolation(
  rule: ERCRule,
  severity: ERCSeverity,
  finding: ERCFinding,
): ERCViolation {
  return {
    ruleId: rule.id,
    ruleKey: rule.key,
    ruleName: rule.name,
    // A rule may escalate or relax an individual occurrence, but an explicit
    // user override always wins — that is applied before we get here.
    severity: finding.severity ?? severity,
    message: finding.message,
    ...(finding.hint ? { hint: finding.hint } : {}),
    components: finding.components ?? [],
    nodes: finding.nodes ?? [],
    pins: finding.pins ?? [],
  };
}

/**
 * Run the enabled ERC rules against a schematic.
 *
 * @example
 * const circuit = Circuit('LED Driver', DC(5), R(330), LED(RED), GND());
 * const result = runERC(circuit);
 * if (!result.passed) console.log(result.report());
 *
 * @example Tune strictness
 * runERC(circuit, {
 *   preset: 'relaxed',
 *   severity: { missingDecoupling: 'off', fanOut: 'warning' },
 *   fanOutLimit: 4,
 * });
 */
export function runERC(schematic: Schematic, options: ERCOptions = {}): ERCResult {
  const resolved = resolveOptions(options);
  const ctx = new ERCContext(schematic);
  const violations: ERCViolation[] = [];

  for (const rule of ERC_RULES) {
    const severity = resolveSeverity(rule, resolved.preset, options.rules, options.severity);
    if (severity === null) continue;

    // A user-specified severity override pins every occurrence of that rule,
    // overriding per-finding escalation.
    const pinned = options.severity?.[rule.key] ?? options.severity?.[rule.id];

    for (const finding of rule.check(ctx, resolved)) {
      const violation = toViolation(rule, severity, finding);
      if (pinned !== undefined && pinned !== 'off') violation.severity = pinned;
      violations.push(violation);
    }
  }

  violations.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return new ERCResult(violations, resolved);
}

// Register runERC on Schematic so `schematic.erc()` works without a circular
// import. This runs once, when the erc module is first loaded.
Schematic._ercRunner = runERC;
