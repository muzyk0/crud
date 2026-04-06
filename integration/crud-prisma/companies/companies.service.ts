import { Injectable } from '@nestjs/common';
import { PrismaCrudModelConfig, PrismaCrudService } from '@nestjsx/crud-prisma';

import { PrismaService } from '../prisma/prisma.service';
import { Company } from './company.model';

function getCompanyModelConfig(): PrismaCrudModelConfig<Company> {
  return {
    modelName: 'Company',
    scalarFields: ['id', 'name', 'domain', 'description', 'deletedAt'],
    primaryKeys: ['id'],
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
export class CompaniesService extends PrismaCrudService<Company> {
  constructor(prisma: PrismaService) {
    super(prisma.company, {
      model: getCompanyModelConfig(),
    });
  }
}
