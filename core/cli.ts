#!/usr/bin/env node
/**
 * WireScript CLI
 *
 * Three exchange formats, all bridged through the DB (backbone):
 *
 *   .ws      — WireScript DSL  (human-readable, plain Circuit() syntax)
 *   .net     — SPICE Netlist   (.net / .cir / .sp)
 *   .json/.csv — DB storage    (WireScriptDb JSON or sectioned CSV)
 *
 * All conversions go through the DB:
 *   ws → db → netlist
 *   netlist → db → ws
 *   etc.
 *
 * Commands
 * --------
 *   convert  <input> --to <format> [--out <file>]   ← universal converter
 *
 *   to-ws          <input.json|.csv|.net>  → .ws
 *   from-ws        <input.ws>              → db json
 *   to-netlist     <input.json|.csv|.ws>   → .net
 *   from-netlist   <input.net>             → db json
 *   to-db          <input.ws|.net>         → db json / csv
 *   from-db        <input.json|.csv>       → (alias for loading DB, piped into other commands)
 *
 *   compile    <input.ts|.ws>  → db json   (legacy alias for from-ws / ts module)
 *   decompile  <input.json>    → ws/ts     (legacy alias for to-ws)
 *
 *   erc        <input>                      ← Electrical Rule Check
 *   rules                                   ← list every ERC rule
 */

import { promises as fs } from 'fs';
import path from 'path';
import * as runtime from './index';
import {
  compileDslToDb,
  reverseDbToDsl,
  serializeDb,
  deserializeDb,
  type WireScriptDb,
  type DbStorageFormat,
} from './db';
import { exportNetlist, importNetlist, type NetlistFormat } from './netlist';
import { exportWs, importWs } from './ws';
import { Schematic } from './Schematic';
import { runERC, listERCRules, type ERCOptions, type ERCPreset, type ERCSeverityMap } from './erc';

// ─────────────────────────────────────────────────────────────────────────────
// Format detection helpers
// ─────────────────────────────────────────────────────────────────────────────

type IoFormat = 'ws' | 'netlist' | 'db-json' | 'db-csv' | 'ts';

function detectFormatFromPath(filePath: string): IoFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ws')                              return 'ws';
  if (ext === '.net' || ext === '.cir' || ext === '.sp') return 'netlist';
  if (ext === '.csv')                             return 'db-csv';
  if (ext === '.json')                            return 'db-json';
  if (ext === '.ts' || ext === '.js')             return 'ts';
  return 'db-json'; // fallback
}

function detectFormatFromContent(src: string): IoFormat {
  const trimmed = src.trim();
  if (trimmed.startsWith('[meta]'))               return 'db-csv';
  if (/^\{/.test(trimmed) && trimmed.includes('"schema"')) return 'db-json';
  if (/\bCircuit\s*\(/.test(trimmed) && !/\bimport\b|\bexport\b/.test(trimmed)) return 'ws';
  return 'netlist';
}

function resolveInputFormat(filePath: string, src: string, flagFormat?: string): IoFormat {
  if (flagFormat) {
    const map: Record<string, IoFormat> = {
      ws: 'ws', netlist: 'netlist', spice: 'netlist',
      'db-json': 'db-json', 'db-csv': 'db-csv', json: 'db-json', csv: 'db-csv',
    };
    return map[flagFormat] ?? detectFormatFromPath(filePath);
  }
  const byPath = detectFormatFromPath(filePath);
  if (byPath !== 'db-json') return byPath; // extension is unambiguous
  return detectFormatFromContent(src);      // fall back to content sniffing
}

// ─────────────────────────────────────────────────────────────────────────────
// Load a file as WireScriptDb (via DB backbone)
// ─────────────────────────────────────────────────────────────────────────────

async function loadDb(filePath: string, format?: string, exportName?: string): Promise<WireScriptDb> {
  const absolutePath = path.resolve(filePath);
  const src = await fs.readFile(absolutePath, 'utf-8');
  const fmt = resolveInputFormat(filePath, src, format);

  switch (fmt) {
    case 'ws':
      return importWs(src);

    case 'netlist':
      return importNetlist(src, { format: 'spice' });

    case 'db-csv':
      return deserializeDb(src, { format: 'csv' });

    case 'db-json':
      return deserializeDb(src, { format: 'json' });

    case 'ts': {
      // TypeScript / JS module with exported Schematic
      const schematic = await loadTsModule(absolutePath, exportName);
      return compileDslToDb(schematic);
    }

    default:
      throw new Error(`Cannot load unknown format: ${fmt}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript module loader (for .ts / .js files)
// ─────────────────────────────────────────────────────────────────────────────

async function loadTsModule(absolutePath: string, exportName?: string): Promise<Schematic> {
  const source = await fs.readFile(absolutePath, 'utf-8');

  if (isPlainDsl(source)) {
    return evalPlainDsl(source, absolutePath);
  }

  const mod = await import(absolutePath);
  const key = exportName ?? 'default';
  const exported = key === 'default' ? mod.default : mod[key];

  if (!exported) throw new Error(`Export not found: ${key}`);
  const value = typeof exported === 'function' ? exported() : exported;
  if (!(value instanceof Schematic)) throw new Error('Export did not return a Schematic');

  return value;
}

function isPlainDsl(src: string): boolean {
  const hasModule = /\bimport\b|\bexport\b|module\.exports|require\s*\(/.test(src);
  return !hasModule && /\bCircuit\s*\(/.test(src);
}

function evalPlainDsl(src: string, filePath: string): Schematic {
  const scope: Record<string, unknown> = { ...runtime };
  const baseCircuit = runtime.Circuit as (...args: unknown[]) => Schematic;
  let captured: Schematic | undefined;

  scope['Circuit'] = (...args: unknown[]) => {
    captured = baseCircuit(...(args as Parameters<typeof baseCircuit>));
    return captured;
  };

  const names = Object.keys(scope);
  const values = names.map(n => scope[n]);

  try {
    new Function(...names, `${src}\nreturn 0;`)(...values);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to evaluate DSL file ${filePath}: ${msg}`);
  }

  if (!captured) throw new Error(`DSL file ${filePath} did not call Circuit(...)`);
  return captured;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schematic loader (for commands that need the live IR, not just the DB)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load any supported input format as an in-memory `Schematic`.
 *
 * TypeScript modules and plain `.ws` sources are evaluated directly. Every
 * other format is normalised through the DB backbone and re-evaluated from its
 * generated DSL, which is the same round-trip `decompile` performs.
 */
async function loadSchematic(
  filePath: string,
  format?: string,
  exportName?: string,
): Promise<Schematic> {
  const absolutePath = path.resolve(filePath);
  const src = await fs.readFile(absolutePath, 'utf-8');
  const fmt = resolveInputFormat(filePath, src, format);

  if (fmt === 'ts') return loadTsModule(absolutePath, exportName);
  if (fmt === 'ws') return evalPlainDsl(src, absolutePath);

  const db = await loadDb(filePath, format, exportName);
  return evalPlainDsl(exportWs(db), absolutePath);
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialize DB to a target format string
// ─────────────────────────────────────────────────────────────────────────────

function serializeOutput(
  db: WireScriptDb,
  toFormat: string,
  opts: {
    dbFormat?: DbStorageFormat;
    netlistFormat?: NetlistFormat;
    netlistTitle?: string;
    moduleImport?: string;
    exportName?: string;
  } = {},
): string {
  switch (toFormat) {
    case 'ws':
      return exportWs(db);

    case 'netlist':
    case 'spice':
      return exportNetlist(db, {
        format: opts.netlistFormat ?? 'spice',
        title: opts.netlistTitle,
      });

    case 'db-csv':
    case 'csv':
      return serializeDb(db, { format: 'csv' });

    case 'db-json':
    case 'json':
    case 'db':
      return serializeDb(db, { format: opts.dbFormat ?? 'json' });

    case 'ts':
      return reverseDbToDsl(db, {
        format: 'ts',
        moduleImport: opts.moduleImport ?? '@ssevindikx/wirescript',
        exportName: opts.exportName ?? 'default',
        preserveIds: true,
      });

    case 'dsl':
      return reverseDbToDsl(db, { format: 'dsl' });

    default:
      throw new Error(
        `Unknown output format: ${toFormat}. ` +
        `Valid: ws, netlist, spice, db, db-json, db-csv, json, csv, ts, dsl`,
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Output helper
// ─────────────────────────────────────────────────────────────────────────────

async function writeOutput(content: string, outputPath: string | undefined, label: string): Promise<void> {
  if (outputPath) {
    const absOut = path.resolve(outputPath);
    await fs.writeFile(absOut, content, 'utf-8');
    console.error(`✓ ${label} → ${absOut}`);
  } else {
    console.log(content);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument helpers
// ─────────────────────────────────────────────────────────────────────────────

function getArgValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 && i < args.length - 1 ? args[i + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage
// ─────────────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log('');
  console.log('WireScript — three exchange formats, one backbone (DB)');
  console.log('');
  console.log('  Formats:  ws (WireScript DSL .ws)  |  netlist (SPICE .net)  |  db (JSON/CSV)');
  console.log('  Backbone: all conversions go through WireScriptDb');
  console.log('');
  console.log('Usage:');
  console.log('  wirescript convert  <input>  --to <format>  [options]');
  console.log('');
  console.log('    --to ws          Convert to WireScript DSL (.ws)');
  console.log('    --to netlist     Convert to SPICE netlist (.net)');
  console.log('    --to db          Convert to DB JSON (.json)');
  console.log('    --to db-csv      Convert to DB CSV (.csv)');
  console.log('    --to ts          Convert to TypeScript module');
  console.log('');
  console.log('    --from <fmt>     Force input format: ws | netlist | db-json | db-csv | ts');
  console.log('    --out <file>     Write to file (default: stdout)');
  console.log('    --name <name>    Override schematic name');
  console.log('    --title <title>  SPICE netlist title comment');
  console.log('    --export <name>  Export name (for --to ts, or TS module input)');
  console.log('    --import <path>  Module import path (for --to ts)');
  console.log('');
  console.log('Shorthand commands (all route through DB):');
  console.log('  wirescript to-ws         <input>         [--out file.ws]');
  console.log('  wirescript from-ws       <input.ws>      [--out file.json]');
  console.log('  wirescript to-netlist    <input>         [--out file.net] [--title "..."]');
  console.log('  wirescript from-netlist  <input.net>     [--out file.json]');
  console.log('  wirescript to-db         <input>         [--format json|csv] [--out file]');
  console.log('  wirescript compile       <input.ts|.ws>  [--out file.json]  (= from-ws/ts)');
  console.log('  wirescript decompile     <input.json>    [--format ws|ts]   (= to-ws/ts)');
  console.log('');
  console.log('Electrical Rule Check:');
  console.log('  wirescript erc           <input>         [options]   (alias: check)');
  console.log('  wirescript rules                         [--json]    List every ERC rule');
  console.log('');
  console.log('    --preset <p>            strict | balanced (default) | relaxed');
  console.log('    --off <keys>            Disable rules, comma-separated');
  console.log('    --severity <k>=<v>      Override severity: error|warning|info|off');
  console.log('    --fan-out <n>           Logic fan-out limit (default 10)');
  console.log('    --resistor-power <w>    Assumed resistor rating in watts (default 0.25)');
  console.log('    --json                  Machine-readable output');
  console.log('    --quiet                 One line per violation, no hints');
  console.log('    --strict-exit           Exit 1 on warnings too (CI gate)');
  console.log('');
  console.log('  Exit code is 1 when any error-severity violation is found.');
  console.log('');
  console.log('Examples:');
  console.log('  wirescript convert circuit.ws --to netlist --out circuit.net');
  console.log('  wirescript convert circuit.net --to ws --out circuit.ws');
  console.log('  wirescript convert circuit.ws --to db-csv --out circuit.csv');
  console.log('  wirescript convert circuit.net --to db --out circuit.json');
  console.log('  wirescript to-ws circuit.net');
  console.log('  wirescript from-netlist circuit.net | wirescript to-ws /dev/stdin');
  console.log('  wirescript erc circuit.ws');
  console.log('  wirescript erc circuit.ts --preset strict --strict-exit');
  console.log('  wirescript erc circuit.net --off missingDecoupling,fanOut --json');
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ERC command
// ─────────────────────────────────────────────────────────────────────────────

const ERC_PRESETS: ERCPreset[] = ['strict', 'balanced', 'relaxed'];

/** Build ERCOptions from CLI flags. */
function parseErcOptions(args: string[]): ERCOptions {
  const options: ERCOptions = {};

  const preset = getArgValue(args, '--preset');
  if (preset) {
    if (!ERC_PRESETS.includes(preset as ERCPreset)) {
      throw new Error(`Unknown preset "${preset}". Use: ${ERC_PRESETS.join(' | ')}`);
    }
    options.preset = preset as ERCPreset;
  }

  const fanOut = getArgValue(args, '--fan-out');
  if (fanOut !== undefined) options.fanOutLimit = Number(fanOut);

  const power = getArgValue(args, '--resistor-power');
  if (power !== undefined) options.resistorPowerRating = Number(power);

  // --off rule1,rule2   /   --severity rule=warning,other=off
  const severity: ERCSeverityMap = {};
  const off = getArgValue(args, '--off');
  if (off) for (const key of off.split(',')) severity[key.trim()] = 'off';

  const overrides = getArgValue(args, '--severity');
  if (overrides) {
    for (const pair of overrides.split(',')) {
      const [key, value] = pair.split('=').map(x => x.trim());
      if (!key || !value) throw new Error(`Bad --severity entry "${pair}". Use rule=error|warning|info|off`);
      severity[key] = value as ERCSeverityMap[string];
    }
  }
  if (Object.keys(severity).length > 0) options.severity = severity;

  return options;
}

/**
 * `wirescript erc <input>` — run the Electrical Rule Check.
 * Exits 1 when any error-severity violation is reported.
 */
async function runErcCommand(args: string[]): Promise<void> {
  const inputPath = args[1];
  if (!inputPath) { printUsage(); process.exit(1); }

  const schematic = await loadSchematic(
    inputPath,
    getArgValue(args, '--from'),
    getArgValue(args, '--export'),
  );
  const result = runERC(schematic, parseErcOptions(args));

  if (hasFlag(args, '--json')) {
    const json = JSON.stringify(result.toJSON(), null, 2);
    await writeOutput(json, getArgValue(args, '--out'), 'erc → json');
  } else {
    const text = hasFlag(args, '--quiet') ? result.summary() : result.report();
    await writeOutput(text, getArgValue(args, '--out'), 'erc');
  }

  // `--strict-exit` also fails the run on warnings, for CI gates.
  const failed = hasFlag(args, '--strict-exit')
    ? result.errors.length + result.warnings.length > 0
    : result.errors.length > 0;
  if (failed) process.exit(1);
}

/** `wirescript rules` — print the rule catalogue. */
function runRulesCommand(args: string[]): void {
  const rules = listERCRules();
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(rules, null, 2));
    return;
  }
  console.log('');
  console.log(`WireScript ERC — ${rules.length} rules`);
  console.log('');
  const width = Math.max(...rules.map(r => r.id.length));
  console.log(`  ${'RULE'.padEnd(width)}  ${'KEY'.padEnd(26)}  BALANCED  DESCRIPTION`);
  for (const rule of rules) {
    console.log(
      `  ${rule.id.padEnd(width)}  ${rule.key.padEnd(26)}  ` +
      `${String(rule.severity.balanced).padEnd(8)}  ${rule.description}`,
    );
  }
  console.log('');
  console.log('  Disable:  --off <key>[,<key>]        Override:  --severity <key>=warning');
  console.log('  Presets:  --preset strict | balanced | relaxed');
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printUsage();
    if (!command) process.exit(1);
    return;
  }

  const inputPath  = args[1];
  const outputPath = getArgValue(args, '--out');
  const fromFlag   = getArgValue(args, '--from');
  const exportName = getArgValue(args, '--export');
  const moduleImport = getArgValue(args, '--import');
  const name       = getArgValue(args, '--name');
  const title      = getArgValue(args, '--title');

  // ── ERC ───────────────────────────────────────────────────────────────────
  if (command === 'erc' || command === 'check') {
    await runErcCommand(args);
    return;
  }

  if (command === 'rules') {
    runRulesCommand(args);
    return;
  }

  // ── Universal converter ───────────────────────────────────────────────────
  if (command === 'convert') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const toFormat = getArgValue(args, '--to');
    if (!toFormat) {
      console.error('Error: --to <format> is required for "convert"');
      process.exit(1);
    }
    const db = await loadDb(inputPath, fromFlag, exportName);
    if (name) db.name = name;
    const out = serializeOutput(db, toFormat, { moduleImport, exportName, netlistTitle: title });
    await writeOutput(out, outputPath, `${inputPath} → ${toFormat}`);
    return;
  }

  // ── to-ws: any format → .ws ───────────────────────────────────────────────
  if (command === 'to-ws') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const db = await loadDb(inputPath, fromFlag, exportName);
    if (name) db.name = name;
    await writeOutput(exportWs(db), outputPath, `→ ws`);
    return;
  }

  // ── from-ws: .ws → DB JSON ────────────────────────────────────────────────
  if (command === 'from-ws') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const src = await fs.readFile(path.resolve(inputPath), 'utf-8');
    const db = importWs(src, name ? { name } : {});
    await writeOutput(serializeDb(db), outputPath, `ws → db`);
    return;
  }

  // ── to-netlist: any format → SPICE netlist ───────────────────────────────
  if (command === 'to-netlist' || command === 'netlist') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const db = await loadDb(inputPath, fromFlag, exportName);
    if (name) db.name = name;
    const out = exportNetlist(db, { format: 'spice', ...(title ? { title } : {}) });
    await writeOutput(out, outputPath, `→ netlist`);
    return;
  }

  // ── from-netlist: SPICE → DB JSON ─────────────────────────────────────────
  if (command === 'from-netlist' || command === 'import-netlist') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const src = await fs.readFile(path.resolve(inputPath), 'utf-8');
    const db = importNetlist(src, { format: 'spice', ...(name ? { name } : {}) });
    await writeOutput(serializeDb(db), outputPath, `netlist → db`);
    return;
  }

  // ── to-db: any format → DB (JSON or CSV) ─────────────────────────────────
  if (command === 'to-db') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const dbFmt = (getArgValue(args, '--format') ?? 'json') as DbStorageFormat;
    const db = await loadDb(inputPath, fromFlag, exportName);
    if (name) db.name = name;
    await writeOutput(serializeDb(db, { format: dbFmt }), outputPath, `→ db (${dbFmt})`);
    return;
  }

  // ── compile: .ts/.ws/.js → DB JSON (legacy / familiar name) ──────────────
  if (command === 'compile' || command === 'dsl2db') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const ext = path.extname(inputPath).toLowerCase();
    let db: WireScriptDb;
    if (ext === '.ws') {
      const src = await fs.readFile(path.resolve(inputPath), 'utf-8');
      db = importWs(src);
    } else {
      const schematic = await loadTsModule(path.resolve(inputPath), exportName);
      db = compileDslToDb(schematic);
    }
    if (name) db.name = name;
    await writeOutput(serializeDb(db), outputPath, `compile → db`);
    return;
  }

  // ── decompile: DB JSON/CSV → .ws or .ts (legacy name) ────────────────────
  if (command === 'decompile' || command === 'db2dsl') {
    if (!inputPath) { printUsage(); process.exit(1); }
    const format = getArgValue(args, '--format') ?? 'ws';
    const src = await fs.readFile(path.resolve(inputPath), 'utf-8');
    const db = deserializeDb(src);
    let out: string;
    if (format === 'ts') {
      out = reverseDbToDsl(db, {
        format: 'ts',
        moduleImport: moduleImport ?? '@ssevindikx/wirescript',
        exportName: exportName ?? 'default',
      });
    } else {
      out = exportWs(db);
    }
    await writeOutput(out, outputPath, `decompile → ${format}`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

run().catch(error => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
