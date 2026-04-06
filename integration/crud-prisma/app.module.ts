import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CrudConfigService } from '@nestjsx/crud';

import { HttpExceptionFilter } from '../shared/https-exception.filter';
import { AuthGuard } from './auth.guard';
import { USER_REQUEST_KEY } from './constants';
import { CompaniesModule } from './companies/companies.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';

CrudConfigService.load({
  auth: {
    property: USER_REQUEST_KEY,
  },
});

@Module({
  imports: [PrismaModule, CompaniesModule, UsersModule, ProjectsModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    HttpExceptionFilter,
  ],
})
export class AppModule {}
