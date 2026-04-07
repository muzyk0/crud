import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { MeController } from './me.controller';
import { UsersAllController } from './users-all.controller';
import { UsersOptionalController } from './users-optional.controller';
import { UsersRequiredController } from './users-required.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, UsersAllController, UsersRequiredController, UsersOptionalController, MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
