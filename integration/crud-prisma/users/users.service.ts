import { Injectable } from '@nestjs/common';
import { PrismaCrudModelConfig, PrismaCrudRelationConfig, PrismaCrudService } from '@nestjsx/crud-prisma';

import { PrismaService } from '../prisma/prisma.service';
import { User } from './user.model';

function getCompanyRelationConfig(): PrismaCrudRelationConfig {
  return {
    type: 'one',
    scalarFields: ['id', 'name', 'domain', 'description', 'deletedAt'],
    primaryKeys: ['id'],
    relationMap: {
      projects: {
        type: 'many',
        scalarFields: ['id', 'name', 'description', 'isActive', 'companyId'],
        primaryKeys: ['id'],
      },
    },
  };
}

function getUserModelConfig(): PrismaCrudModelConfig<User> {
  return {
    modelName: 'User',
    scalarFields: ['id', 'email', 'isActive', 'companyId', 'profileId', 'nameFirst', 'nameLast', 'deletedAt'],
    primaryKeys: ['id'],
    relationMap: {
      company: getCompanyRelationConfig(),
      profile: {
        type: 'one',
        scalarFields: ['id', 'name', 'deletedAt'],
        primaryKeys: ['id'],
      },
      projects: {
        type: 'many',
        scalarFields: ['id', 'name', 'description', 'isActive', 'companyId'],
        primaryKeys: ['id'],
      },
    },
    softDelete: {
      field: 'deletedAt',
      deletedValue: () => new Date(),
      notDeletedValue: null,
    },
    whereUnique: (params, entity) => ({
      id: Number(entity && entity.id ? entity.id : params.id),
    }),
  };
}

@Injectable()
export class UsersService extends PrismaCrudService<User> {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.user, {
      model: getUserModelConfig(),
    });
  }

  getAuthenticatedUser(): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: 1 },
      select: {
        id: true,
        email: true,
        isActive: true,
        companyId: true,
        profileId: true,
        nameFirst: true,
        nameLast: true,
        deletedAt: true,
      },
    });
  }
}
