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

function writeInputModule(tempDir: string): string {
  const inputPath = path.join(tempDir, 'input.js');
  const content = [
    `const wirelang = require(${JSON.stringify(distIndex)});`,
    'const { Circuit, DC, R, GND } = wirelang;',
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirelang-cli-'));
    const inputPath = writeInputModule(tempDir);
    const outputPath = path.join(tempDir, 'output.json');

    runCli(['dsl2db', inputPath, '--out', outputPath]);

    const raw = fs.readFileSync(outputPath, 'utf-8');
    const db = JSON.parse(raw) as { schema: string; name: string; components: unknown[]; nodes: unknown[] };

    expect(db.schema).toBe('wirelang-db@v1');
    expect(db.name).toBe('Cli');
    expect(db.components.length).toBe(3);
    expect(db.nodes.length).toBeGreaterThan(0);
  });

  it('should compile plain DSL input to DB via CLI', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirelang-cli-'));
    const inputPath = writePlainDslInput(tempDir);
    const outputPath = path.join(tempDir, 'plain-output.json');

    runCli(['dsl2db', inputPath, '--out', outputPath]);

    const raw = fs.readFileSync(outputPath, 'utf-8');
    const db = JSON.parse(raw) as { schema: string; name: string; components: unknown[]; nodes: unknown[] };

    expect(db.schema).toBe('wirelang-db@v1');
    expect(db.name).toBe('Cli Plain');
    expect(db.components.length).toBe(3);
    expect(db.nodes.length).toBeGreaterThan(0);
  });

  it('should compile DB to DSL via CLI with default plain output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirelang-cli-'));
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wirelang-cli-'));
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
