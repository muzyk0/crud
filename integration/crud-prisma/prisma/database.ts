import { resolve } from 'path';

export function getPrismaDatabasePath(): string {
  return resolve(__dirname, 'dev.db');
}

export function getPrismaDatabaseUrl(): string {
  return `file:${getPrismaDatabasePath()}`;
}
