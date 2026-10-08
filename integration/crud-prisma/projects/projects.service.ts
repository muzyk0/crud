import { Injectable } from '@nestjs/common';
import { PrismaCrudModelConfig, PrismaCrudService } from '@nestjsx/crud-prisma';

import { PrismaService } from '../prisma/prisma.service';
import { Project } from './project.model';

function getProjectModelConfig(): PrismaCrudModelConfig<Project> {
  return {
    modelName: 'Project',
    scalarFields: ['id', 'name', 'description', 'isActive', 'companyId'],
    stringFields: ['name', 'description'],
    primaryKeys: ['id'],
    whereUnique: (params, entity) => ({
      id: Number(entity && entity.id ? entity.id : params.id),
    }),
  };
}

@Injectable()
export class ProjectsService extends PrismaCrudService<Project> {
  constructor(prisma: PrismaService) {
    super(prisma.project, {
      model: getProjectModelConfig(),
    });
  }
}
