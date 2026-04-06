import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  definePrismaCrudModelConfig,
  definePrismaCrudOptions,
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

function readDoc(rootSegments: number, relativePath: string): string {
  return readFileSync(resolve(__dirname, ...Array(rootSegments).fill('..'), relativePath), 'utf8');
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
    stringFields: ['name', 'domain', 'description'],
    primaryKeys: ['id'],
    relationMap: {
      projects: {
        type: 'many',
        scalarFields: ['id', 'name', 'description', 'isActive', 'companyId'],
        stringFields: ['name', 'description'],
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
      const readme = readDoc(3, 'packages/crud-prisma/README.md');

      expect(readme).toContain('@nestjsx/crud-prisma');
      expect(readme).toContain('PrismaCrudService');
      expect(readme).toContain('definePrismaCrudModelConfig');
      expect(readme).toContain('stringFields');
      expect(readme).toContain('whereUnique');
      expect(readme).toContain('relationMap');
      expect(readme).toContain('normalizeCreate');
      expect(readme).toContain('Known non-goals');
      expect(readme).toContain('Route response flags');
      expect(readme).toContain('PrismaCrudOptions.cache');
    });

    it('should keep the documented service example valid against the current public API', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(
        delegate,
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
      const deletedAt = new Date('2026-04-06T00:00:00.000Z');

      delegate.findFirst.mockResolvedValue({
        id: 1,
        name: 'ACME',
        domain: 'acme.test',
        description: null,
        deletedAt: null,
      });
      delegate.update.mockResolvedValue({
        id: 1,
        name: 'ACME',
        domain: 'acme.test',
        description: null,
        deletedAt,
      });

      expect(service).toBeInstanceOf(PrismaCrudService);
      await expect(
        service.deleteOne({
          parsed: {
            fields: [],
            paramsFilter: [{ field: 'id', operator: '$eq', value: 1 }],
            authPersist: {},
            classTransformOptions: {},
            search: {
              id: 1,
            },
            filter: [],
            or: [],
            join: [],
            sort: [],
            limit: 0,
            offset: 0,
            page: 0,
            cache: 0,
            includeDeleted: 0,
          },
          options: {
            query: {
              softDelete: true,
            },
            params: {},
            routes: {
              deleteOneBase: {
                returnDeleted: false,
              },
            },
          },
        }),
      ).resolves.toBeUndefined();

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 1,
        },
        data: {
          deletedAt,
        },
      });
    });

    it('should keep the repo and wiki docs aligned with the verified fixture routes', () => {
      const rootReadme = readDoc(3, 'README.md');
      const servicesPage = readDoc(4, 'crud.wiki/Services.md');
      const sidebar = readDoc(4, 'crud.wiki/_Sidebar.md');
      const prismaPage = readDoc(4, 'crud.wiki/ServicePrisma.md');

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
      expect(prismaPage).toContain('returnShallow');
      expect(prismaPage).toContain('returnRecovered');
      expect(prismaPage).toContain('allowParamsOverride');
      expect(prismaPage).toContain('stringFields');
      expect(prismaPage).toContain('PrismaCrudOptions.cache');
      expect(prismaPage).toContain('get(key)');
      expect(prismaPage).toContain('set(key, value, ttl)');
      expect(prismaPage).toContain('Implicit nested writes or cascade behavior.');
    });
  });
});
