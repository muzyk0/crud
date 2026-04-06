import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  definePrismaCrudModelConfig,
  definePrismaCrudOptions,
  PRISMA_CRUD_COMPATIBILITY,
  PrismaCrudModelConfig,
  PrismaCrudService,
} from '@nestjsx/crud-prisma';

interface CompanyRecord {
  id: number;
  name: string;
  domain: string;
  description: string | null;
  deletedAt: Date | null;
}

function readFromInnerRepo(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../..', relativePath), 'utf8');
}

function readFromWorkspace(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../../..', relativePath), 'utf8');
}

function createDelegate() {
  return {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function getCompanyModelConfig(): PrismaCrudModelConfig<CompanyRecord> {
  return definePrismaCrudModelConfig<CompanyRecord>({
    modelName: 'Company',
    scalarFields: ['id', 'name', 'domain', 'description', 'deletedAt'],
    primaryKeys: ['id'],
    relationMap: {
      projects: {
        type: 'many',
        scalarFields: ['id', 'name', 'description', 'isActive', 'companyId'],
        primaryKeys: ['id'],
      },
    },
    softDelete: {
      field: 'deletedAt',
      deletedValue: () => new Date('2026-04-06T00:00:00.000Z'),
      notDeletedValue: null,
    },
    whereUnique: (params, entity) => ({
      id: Number(entity && entity.id ? entity.id : params.id),
    }),
    write: {
      normalizeCreate: ({ dto }) => dto,
      normalizeUpdate: ({ dto }) => dto,
    },
  });
}

describe('#crud-prisma', () => {
  describe('#documentation contract', () => {
    it('should keep the package README aligned with the exported Prisma compatibility contract', () => {
      const readme = readFromInnerRepo('packages/crud-prisma/README.md');

      expect(readme).toContain('@nestjsx/crud-prisma');
      expect(readme).toContain('PrismaCrudService');
      expect(readme).toContain('definePrismaCrudModelConfig');
      expect(readme).toContain('whereUnique');
      expect(readme).toContain('relationMap');
      expect(readme).toContain('normalizeCreate');

      PRISMA_CRUD_COMPATIBILITY.goals.forEach((goal) => {
        expect(readme).toContain(goal);
      });

      PRISMA_CRUD_COMPATIBILITY.supported.forEach((supported) => {
        expect(readme).toContain(supported);
      });

      PRISMA_CRUD_COMPATIBILITY.nonGoals.forEach((nonGoal) => {
        expect(readme).toContain(nonGoal);
      });

      Object.values(PRISMA_CRUD_COMPATIBILITY.notes).forEach((note) => {
        expect(readme).toContain(note);
      });
    });

    it('should keep the documented service example valid against the current public API', () => {
      const service = new PrismaCrudService(
        createDelegate(),
        definePrismaCrudOptions({
          model: getCompanyModelConfig(),
          query: {
            softDelete: true,
          },
          routes: {
            deleteOneBase: {
              returnDeleted: false,
            },
          },
        }),
      );

      expect(service).toBeInstanceOf(PrismaCrudService);
    });

    it('should keep the repo and wiki docs aligned with the verified fixture routes', () => {
      const rootReadme = readFromInnerRepo('README.md');
      const servicesPage = readFromWorkspace('crud.wiki/Services.md');
      const sidebar = readFromWorkspace('crud.wiki/_Sidebar.md');
      const prismaPage = readFromWorkspace('crud.wiki/ServicePrisma.md');

      expect(rootReadme).toContain('@nestjsx/crud-prisma');
      expect(rootReadme).toContain('ServicePrisma');
      expect(servicesPage).toContain('Prisma');
      expect(servicesPage).toContain('@nestjsx/crud-prisma');
      expect(sidebar).toContain('[Prisma]');
      expect(prismaPage).toContain('GET /companies?include_deleted=1');
      expect(prismaPage).toContain('GET /users/1?join=company&join=company.projects');
      expect(prismaPage).toContain('POST /companies/:companyId/users');
      expect(prismaPage).toContain('PATCH /me');
      expect(prismaPage).toContain('POST /projects');
      expect(prismaPage).toContain('returnDeleted');
      expect(prismaPage).toContain('allowParamsOverride');
      expect(prismaPage).toContain('Implicit nested writes or cascade behavior.');
    });
  });
});
