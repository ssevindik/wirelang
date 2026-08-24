/**
 * CLI Integration Tests
 */

/// <reference types="node" />

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const distCli = path.join(distDir, 'cli.js');
const distIndex = path.join(distDir, 'index.js');

function ensureBuild(): void {
  const tscPath = path.join(repoRoot, 'node_modules', '.bin', 'tsc');
  const result = spawnSync(tscPath, ['--project', path.join(repoRoot, 'tsconfig.json')], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`Build failed: ${output}`);
  }
}

function runCli(args: string[]): { stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [distCli, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`CLI failed: ${output}`);
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Like runCli, but tolerates a non-zero exit (ERC exits 1 on errors). */
function runCliRaw(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [distCli, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 0,
  };
}

function writeWs(tempDir: string, name: string, lines: string[]): string {
  const inputPath = path.join(tempDir, name);
  fs.writeFileSync(inputPath, lines.join('\n') + '\n', 'utf-8');
  return inputPath;
}

function writeInputModule(tempDir: string): string {
  const inputPath = path.join(tempDir, 'input.js');
  const content = [
    `const wirescript = require(${JSON.stringify(distIndex)});`,
    'const { Circuit, DC, R, GND } = wirescript;',
    'module.exports = () => Circuit("Cli", DC(5), R(100), GND());',
    '',
  ].join('\n');

  fs.writeFileSync(inputPath, content, 'utf-8');
  return inputPath;
}

function writePlainDslInput(tempDir: string): string {
  const inputPath = path.join(tempDir, 'input.dsl');
  const content = [
    'V1 = DC(5)',
    'R1 = R(100)',
    'GND1 = GND()',
    '',
    'Circuit(',
    '  "Cli Plain",',
    '  [',
    '    [V1.pin("positive"), R1.pin("1")],',
    '    [V1.pin("negative"), R1.pin("2"), GND1.pin("gnd")]',
    '  ]',
    ')',
    '',
  ].join('\n');

  fs.writeFileSync(inputPath, content, 'utf-8');
  return inputPath;
}

describe('CLI', () => {
  beforeAll(() => {
    ensureBuild();
  });

  it('should compile DSL to DB via CLI', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-cli-'));
    const inputPath = writeInputModule(tempDir);
    const outputPath = path.join(tempDir, 'output.json');

    runCli(['dsl2db', inputPath, '--out', outputPath]);

    const raw = fs.readFileSync(outputPath, 'utf-8');
    const db = JSON.parse(raw) as { schema: string; name: string; components: unknown[]; nodes: unknown[] };

    expect(db.schema).toBe('wirescript-db@v1');
    expect(db.name).toBe('Cli');
    expect(db.components.length).toBe(3);
    expect(db.nodes.length).toBeGreaterThan(0);
  });

  it('should compile plain DSL input to DB via CLI', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-cli-'));
    const inputPath = writePlainDslInput(tempDir);
    const outputPath = path.join(tempDir, 'plain-output.json');

    runCli(['dsl2db', inputPath, '--out', outputPath]);

    const raw = fs.readFileSync(outputPath, 'utf-8');
    const db = JSON.parse(raw) as { schema: string; name: string; components: unknown[]; nodes: unknown[] };

    expect(db.schema).toBe('wirescript-db@v1');
    expect(db.name).toBe('Cli Plain');
    expect(db.components.length).toBe(3);
    expect(db.nodes.length).toBeGreaterThan(0);
  });

  it('should compile DB to DSL via CLI with default plain output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-cli-'));
    const inputPath = writeInputModule(tempDir);
    const dbPath = path.join(tempDir, 'output.json');
    const dslPath = path.join(tempDir, 'output.dsl.js');

    runCli(['dsl2db', inputPath, '--out', dbPath]);
    runCli(['db2dsl', dbPath, '--out', dslPath]);

    const dsl = fs.readFileSync(dslPath, 'utf-8');
    expect(dsl).not.toContain('module.exports');
    expect(dsl).not.toContain('require(');
    expect(dsl).not.toContain('const ');
    expect(dsl).not.toContain('import ');
    expect(dsl).toContain('Circuit(');
    expect(dsl).toContain('.p');
    expect(dsl).toContain('.p1');
    expect(dsl).toContain('.p2');
    expect(dsl).toContain('DC(');
    expect(dsl).toContain('R(');
    expect(dsl).toContain('GND(');
  });

  it('should compile DB to TypeScript-like output via CLI when format is ts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-cli-'));
    const inputPath = writeInputModule(tempDir);
    const dbPath = path.join(tempDir, 'output.json');
    const tsPath = path.join(tempDir, 'output.ts');

    runCli(['dsl2db', inputPath, '--out', dbPath]);
    runCli(['db2dsl', dbPath, '--format', 'ts', '--out', tsPath]);

    const ts = fs.readFileSync(tsPath, 'utf-8');
    expect(ts).toContain('createSchematic');
    expect(ts).toContain('s.connect');
    expect(ts).toContain('export default s');
  });
});

describe('CLI — erc', () => {
  beforeAll(() => {
    ensureBuild();
  });

  const GOOD = [
    'V1 = DC(5)',
    'R1 = R(330)',
    'LED1 = LED(RED)',
    'GND1 = GND()',
    '',
    'Circuit("Good", [',
    '  [V1.p, R1.p1],',
    '  [R1.p2, LED1.anode],',
    '  [LED1.cathode, GND1.gnd, V1.n]',
    '])',
  ];

  const BAD = [
    'LED1 = LED(RED)',
    'VCC1 = VCC(12)',
    'GND1 = GND()',
    '',
    'Circuit("Bad", [',
    '  [VCC1, LED1.anode],',
    '  [LED1.cathode, GND1]',
    '])',
  ];

  it('exits 0 and reports a pass for a sound circuit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const result = runCliRaw(['erc', writeWs(dir, 'good.ws', GOOD)]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ERC passed');
  });

  it('exits 1 and names the rule for a faulty circuit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const result = runCliRaw(['erc', writeWs(dir, 'bad.ws', BAD)]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('ERC_NO_CURRENT_LIMIT');
    expect(result.stdout).toContain('↳');
  });

  it('emits machine-readable JSON with --json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const result = runCliRaw(['erc', writeWs(dir, 'bad.ws', BAD), '--json']);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.passed).toBe(false);
    expect(parsed.counts.error).toBeGreaterThan(0);
    expect(parsed.violations[0].ruleId).toMatch(/^ERC_/);
  });

  it('--off disables the named rules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const result = runCliRaw([
      'erc', writeWs(dir, 'bad.ws', BAD),
      '--off', 'supplyShort,noCurrentLimit',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ERC passed');
  });

  it('--severity downgrades a rule', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const result = runCliRaw([
      'erc', writeWs(dir, 'bad.ws', BAD), '--json',
      '--severity', 'noCurrentLimit=warning,supplyShort=off',
    ]);
    const parsed = JSON.parse(result.stdout);
    const hit = parsed.violations.find((v: { ruleId: string }) => v.ruleId === 'ERC_NO_CURRENT_LIMIT');
    expect(hit.severity).toBe('warning');
  });

  it('--strict-exit fails the run on warnings alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const input = writeWs(dir, 'bad.ws', BAD);
    expect(runCliRaw(['erc', input, '--severity', 'noCurrentLimit=warning,supplyShort=off']).status).toBe(0);
    expect(runCliRaw(['erc', input, '--severity', 'noCurrentLimit=warning,supplyShort=off', '--strict-exit']).status).toBe(1);
  });

  it('runs on a SPICE netlist round-trip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const wsPath = writeWs(dir, 'good.ws', GOOD);
    const netPath = path.join(dir, 'good.net');
    runCli(['to-netlist', wsPath, '--out', netPath]);
    const result = runCliRaw(['erc', netPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ERC passed');
  });

  it('rejects an unknown preset', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirescript-erc-'));
    const result = runCliRaw(['erc', writeWs(dir, 'good.ws', GOOD), '--preset', 'nope']);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('Unknown preset');
  });
});

describe('CLI — rules', () => {
  beforeAll(() => {
    ensureBuild();
  });

  it('lists every rule', () => {
    const { stdout } = runCli(['rules']);
    expect(stdout).toContain('ERC_SHORT_CIRCUIT');
    expect(stdout).toContain('ERC_NO_CURRENT_LIMIT');
    expect(stdout).toMatch(/\d+ rules/);
  });

  it('emits the catalogue as JSON', () => {
    const { stdout } = runCli(['rules', '--json']);
    const rules = JSON.parse(stdout);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules[0]).toHaveProperty('key');
    expect(rules[0]).toHaveProperty('severity');
  });
});
