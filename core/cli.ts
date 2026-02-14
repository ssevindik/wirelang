#!/usr/bin/env node
/**
 * WireLang CLI - DSL<->DB conversions
 */

import { promises as fs } from 'fs';
import path from 'path';
import { compileDslToDb, reverseDbToDsl, type WireLangDb } from './db';
import { Schematic } from './Schematic';

function printUsage(): void {
  // Keep usage minimal and ASCII-only
  console.log('Usage:');
  console.log('  wirelang dsl2db <input.js> [--export name] [--out output.json]');
  console.log('  wirelang db2dsl <input.json> [--out output.ts]');
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }
  return args[index + 1];
}

async function loadSchematic(modulePath: string, exportName?: string): Promise<Schematic> {
  const absolutePath = path.resolve(modulePath);
  const mod = await import(absolutePath);
  const key = exportName ?? 'default';
  const exported = key === 'default' ? mod.default : mod[key];

  if (!exported) {
    throw new Error(`Export not found: ${key}`);
  }

  const value = typeof exported === 'function' ? exported() : exported;
  if (!(value instanceof Schematic)) {
    throw new Error('Export did not return a Schematic');
  }

  return value;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  if (command === 'dsl2db') {
    const inputPath = args[1];
    if (!inputPath) {
      printUsage();
      process.exit(1);
    }

    const exportName = getArgValue(args, '--export');
    const outputPath = getArgValue(args, '--out');
    const schematic = await loadSchematic(inputPath, exportName);
    const db = compileDslToDb(schematic);
    const json = JSON.stringify(db, null, 2);

    if (outputPath) {
      await fs.writeFile(outputPath, json, 'utf-8');
    } else {
      console.log(json);
    }
    return;
  }

  if (command === 'db2dsl') {
    const inputPath = args[1];
    if (!inputPath) {
      printUsage();
      process.exit(1);
    }
    const outputPath = getArgValue(args, '--out');
    const raw = await fs.readFile(inputPath, 'utf-8');
    const db = JSON.parse(raw) as WireLangDb;
    const dsl = reverseDbToDsl(db);

    if (outputPath) {
      await fs.writeFile(outputPath, dsl, 'utf-8');
    } else {
      console.log(dsl);
    }
    return;
  }

  printUsage();
  process.exit(1);
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});