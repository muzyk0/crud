import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { getPrismaDatabaseUrl } from './database';
import { PrismaClientBase } from './prisma-runtime';

@Injectable()
export class PrismaService extends PrismaClientBase implements OnModuleInit, OnModuleDestroy {
  constructor() {
    process.env.DATABASE_URL = process.env.DATABASE_URL || getPrismaDatabaseUrl();
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
