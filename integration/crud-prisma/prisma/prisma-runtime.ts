import { createRequire } from 'module';
import { resolve } from 'path';

const integrationRequire = createRequire(resolve(__dirname, '..', 'package.json'));
const prismaClientEntrypoint = resolve(__dirname, '..', 'node_modules/.prisma/client/index.js');

export const PrismaClientBase = integrationRequire(prismaClientEntrypoint).PrismaClient as {
  new (options?: Record<string, unknown>): any;
};
