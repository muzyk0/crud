import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { getPrismaDatabaseUrl } from './database';

const integrationRoot = resolve(__dirname, '..');
const prismaBinary = resolve(integrationRoot, 'node_modules/.bin/prisma');

let dependenciesReady: Promise<void> | null = null;

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: getPrismaDatabaseUrl(),
    },
  });
}

function ensurePrismaIntegrationDependencies(): Promise<void> {
  if (!dependenciesReady) {
    dependenciesReady = Promise.resolve().then(() => {
      process.env.DATABASE_URL = getPrismaDatabaseUrl();

      if (!existsSync(prismaBinary)) {
        run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], integrationRoot);
      }
    });
  }

  return dependenciesReady;
}

export function preparePrismaIntegrationDatabase(): Promise<void> {
  return ensurePrismaIntegrationDependencies().then(() => {
    process.env.DATABASE_URL = getPrismaDatabaseUrl();
    run('npm', ['run', 'db:prepare', '--silent'], integrationRoot);
  });
}

export function ensurePrismaIntegrationReady(): Promise<void> {
  return preparePrismaIntegrationDatabase();
}
