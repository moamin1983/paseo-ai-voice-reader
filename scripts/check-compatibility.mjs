// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

// Check SDK contracts in isolated checkouts; never mutate the working dependencies
// or contact a Paseo daemon. Package acquisition uses npm with scripts disabled.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = process.cwd();
const requested = process.argv.slice(2);
const versions = requested.length ? requested : ['0.11.4', '0.12.0', 'latest'];
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
if (tracked.status !== 0) throw new Error('Run the compatibility check from the Git source checkout.');
const files = tracked.stdout.split('\0').filter(Boolean);
await mkdir('evidence/compatibility', { recursive: true });
const results = [];
for (const version of versions) {
  if (!/^(?:latest|\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)$/.test(version)) throw new Error('Use an exact SDK version or latest.');
  const scratch = await mkdtemp(join(tmpdir(), 'voice-sdk-check-'));
  const log = [];
  const run = (args) => {
    const result = spawnSync('npm', args, { cwd: scratch, encoding: 'utf8', timeout: 180_000, maxBuffer: 8_000_000 });
    log.push('$ npm ' + args.join(' ') + '\n' + (result.stdout ?? '') + (result.stderr ?? ''));
    if (result.error || result.status !== 0) throw new Error(result.error?.message ?? 'npm ' + args.join(' ') + ' failed; see compatibility log.');
  };
  let outcome;
  try {
    console.log('Checking Paseo SDK ' + version + ' in an isolated checkout…');
    for (const file of files) {
      const target = join(scratch, file);
      await mkdir(join(target, '..'), { recursive: true });
      await cp(join(root, file), target);
    }
    run(['ci', '--ignore-scripts', '--no-audit']);
    if (version !== pkg.devDependencies['@getpaseo/plugin'])
      run(['install', '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', ...['plugin', 'client', 'protocol'].map(name => '@getpaseo/' + name + '@' + version)]);
    const resolved = JSON.parse(await readFile(join(scratch, 'node_modules/@getpaseo/plugin/package.json'), 'utf8')).version;
    run(['run', 'typecheck']);
    run(['test']);
    run(['run', 'build:check']);
    outcome = { requested: version, resolved, passed: true };
  } catch (error) {
    outcome = { requested: version, passed: false, error: error.message };
  } finally {
    await writeFile(join(root, 'evidence/compatibility/sdk-' + version + '.log'), log.join('\n'));
    await rm(scratch, { recursive: true, force: true });
  }
  results.push(outcome);
  console.log(JSON.stringify(outcome));
}
await writeFile('evidence/compatibility/sdk-matrix.json', JSON.stringify(results, null, 2) + '\n');
if (results.some(r => !r.passed)) process.exitCode = 1;
