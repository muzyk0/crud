import { NotFoundException } from '@nestjs/common';
import { CrudRequest } from '@nestjsx/crud';
import { ParsedRequestParams, RequestQueryBuilder, RequestQueryParser } from '@nestjsx/crud-request';
import { PrismaCrudModelConfig, PrismaCrudService } from '@nestjsx/crud-prisma';
import { parse } from 'qs';

interface UserRecord {
  id: number;
  name: string;
  email: string;
  tenantId: number;
  deletedAt: Date | null;
}

interface MembershipRecord {
  tenantId: number;
  userId: number;
  role: string;
}

function parseQuery(build: (qb: RequestQueryBuilder) => RequestQueryBuilder): ParsedRequestParams {
  const qb = build(RequestQueryBuilder.create());
  const parser = RequestQueryParser.create();

  parser.parseQuery(parse(qb.query(false)));

  return parser.getParsed();
}

function createRequest(parsed: ParsedRequestParams, options: CrudRequest['options'] = {}): CrudRequest {
  return {
    parsed,
    options: {
      query: {},
      params: {},
      routes: {},
      ...options,
    },
  };
}

function getUserModelConfig(): PrismaCrudModelConfig<UserRecord> {
  return {
    modelName: 'User',
    scalarFields: ['id', 'name', 'email', 'tenantId', 'deletedAt'],
    stringFields: ['name', 'email'],
    primaryKeys: ['id'],
    relationMap: {
      company: {
        type: 'one',
        scalarFields: ['id', 'name', 'updatedAt'],
        stringFields: ['name'],
        primaryKeys: ['id'],
        relationMap: {
          projects: {
            type: 'many',
            scalarFields: ['id', 'name', 'companyId'],
            stringFields: ['name'],
            primaryKeys: ['id'],
          },
        },
      },
    },
    softDelete: {
      field: 'deletedAt',
      deletedValue: () => new Date(),
      notDeletedValue: null,
    },
    whereUnique: (params) => ({ id: params.id }),
  };
}

function getMembershipModelConfig(): PrismaCrudModelConfig<MembershipRecord> {
  return {
    modelName: 'Membership',
    scalarFields: ['tenantId', 'userId', 'role'],
    primaryKeys: ['tenantId', 'userId'],
    whereUnique: (params) => ({
      tenantId_userId: {
        tenantId: params.tenantId,
        userId: params.userId,
      },
    }),
  };
}

function createDelegate() {
  return {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  };
}

describe('#crud-prisma', () => {
  describe('#PrismaCrudService read behavior', () => {
    it('should proxy find, findOne, and count to the Prisma delegate', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const where = { id: { equals: 1 } };
      const select = { id: true } as const;

      delegate.findMany.mockResolvedValue([{ id: 1 }]);
      delegate.findFirst.mockResolvedValue({ id: 1 });
      delegate.count.mockResolvedValue(1);

      await expect(service.find({ select, where })).resolves.toEqual([{ id: 1 }]);
      await expect(service.findOne({ select, where })).resolves.toEqual({ id: 1 });
      await expect(service.count({ where })).resolves.toBe(1);

      expect(delegate.findMany).toHaveBeenCalledWith({ select, where });
      expect(delegate.findFirst).toHaveBeenCalledWith({ select, where });
      expect(delegate.count).toHaveBeenCalledWith({ where });
    });

    it('should cache paginated getMany results when query caching is enabled', async () => {
      const delegate = createDelegate();
      const cache = {
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
      };
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
        cache,
        query: {
          alwaysPaginate: true,
          cache: 120,
        },
      });
      const parsed = parseQuery((qb) => qb.setLimit(2).setPage(1).sortBy({ field: 'name', order: 'ASC' }));
      const data = [
        { id: 1, name: 'User 1', email: '1@email.com', tenantId: 10, deletedAt: null },
        { id: 2, name: 'User 2', email: '2@email.com', tenantId: 10, deletedAt: null },
      ];

      delegate.findMany.mockResolvedValue(data);
      delegate.count.mockResolvedValue(4);

      await expect(service.getMany(createRequest(parsed))).resolves.toEqual({
        data,
        count: 2,
        total: 4,
        page: 1,
        pageCount: 2,
      });

      expect(cache.get).toHaveBeenCalledWith(expect.stringContaining(':many:page'));
      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining(':many:page'),
        {
          data,
          count: 2,
          total: 4,
          page: 1,
          pageCount: 2,
        },
        120,
      );
    });

    it('should honor cached getOne results before hitting the delegate', async () => {
      const delegate = createDelegate();
      const cached = {
        id: 7,
        name: 'Cached User',
        email: 'cached@email.com',
        tenantId: 5,
        deletedAt: null,
      };
      const cache = {
        get: jest.fn().mockResolvedValue(cached),
        set: jest.fn(),
      };
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
        cache,
        query: {
          cache: 60,
        },
      });
      const parsed = parseQuery((qb) => qb.select(['name']));

      parsed.paramsFilter = [{ field: 'id', operator: '$eq', value: 7 }];

      await expect(service.getOne(createRequest(parsed))).resolves.toEqual(cached);

      expect(cache.get).toHaveBeenCalledWith(expect.stringContaining(':one'));
      expect(delegate.findUnique).not.toHaveBeenCalled();
      expect(delegate.findFirst).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should preserve pagination metadata for getMany when alwaysPaginate is enabled', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = parseQuery((qb) =>
        qb
          .setFilter({ field: 'tenantId', operator: 'eq', value: 10 })
          .setLimit(2)
          .setPage(2)
          .sortBy({ field: 'name', order: 'ASC' }),
      );
      const data = [
        { id: 3, name: 'User 3', email: '3@email.com', tenantId: 10, deletedAt: null },
        { id: 4, name: 'User 4', email: '4@email.com', tenantId: 10, deletedAt: null },
      ];

      delegate.findMany.mockResolvedValue(data);
      delegate.count.mockResolvedValue(5);

      await expect(
        service.getMany(
          createRequest(parsed, {
            query: {
              alwaysPaginate: true,
            },
          }),
        ),
      ).resolves.toEqual({
        data,
        count: 2,
        total: 5,
        page: 2,
        pageCount: 3,
      });

      expect(delegate.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          tenantId: true,
          deletedAt: true,
        },
        orderBy: [{ name: 'asc' }],
        take: 2,
        skip: 2,
        where: {
          tenantId: {
            equals: 10,
          },
        },
      });
      expect(delegate.count).toHaveBeenCalledWith({
        where: {
          tenantId: {
            equals: 10,
          },
        },
      });
    });

    it('should map includeDeleted, eager relations, and required joins for getOne', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = parseQuery((qb) => qb.setJoin({ field: 'company.projects' }));

      parsed.includeDeleted = 1;
      delegate.findFirst.mockResolvedValue({
        id: 9,
        name: 'Deleted User',
        email: 'deleted@email.com',
        tenantId: 20,
        deletedAt: new Date(),
      });

      await expect(
        service.getOne(
          createRequest(parsed, {
            query: {
              softDelete: true,
              join: {
                company: {
                  eager: true,
                },
                'company.projects': {
                  required: true,
                },
              },
            },
          }),
        ),
      ).resolves.toMatchObject({
        id: 9,
        name: 'Deleted User',
      });

      expect(delegate.findUnique).not.toHaveBeenCalled();
      expect(delegate.findFirst).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          tenantId: true,
          deletedAt: true,
          company: {
            select: {
              id: true,
              name: true,
              updatedAt: true,
              projects: {
                select: {
                  id: true,
                  name: true,
                  companyId: true,
                },
              },
            },
          },
        },
        where: {
          company: {
            is: {
              projects: {
                some: {},
              },
            },
          },
        },
      });
    });

    it('should use the explicit whereUnique builder for pure compound-key reads', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getMembershipModelConfig(),
      });
      const parsed = parseQuery((qb) => qb.select(['role']));

      parsed.paramsFilter = [
        { field: 'tenantId', operator: '$eq', value: 7 },
        { field: 'userId', operator: '$eq', value: 9 },
      ];
      delegate.findUnique.mockResolvedValue({
        tenantId: 7,
        userId: 9,
        role: 'admin',
      });

      await expect(service.getOne(createRequest(parsed))).resolves.toEqual({
        tenantId: 7,
        userId: 9,
        role: 'admin',
      });

      expect(delegate.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_userId: {
            tenantId: 7,
            userId: 9,
          },
        },
        select: {
          tenantId: true,
          userId: true,
          role: true,
        },
      });
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('should avoid findUnique when route params include non-primary scope fields', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = parseQuery((qb) => qb.select(['name']));

      parsed.paramsFilter = [
        { field: 'tenantId', operator: '$eq', value: 7 },
        { field: 'id', operator: '$eq', value: 9 },
      ];
      delegate.findFirst.mockResolvedValue({
        id: 9,
        name: 'Scoped User',
        email: 'scoped@email.com',
        tenantId: 7,
        deletedAt: null,
      });

      await expect(service.getOne(createRequest(parsed))).resolves.toMatchObject({
        id: 9,
        name: 'Scoped User',
      });

      expect(delegate.findUnique).not.toHaveBeenCalled();
      expect(delegate.findFirst).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
        },
        where: {
          AND: [
            {
              tenantId: {
                equals: 7,
              },
            },
            {
              id: {
                equals: 9,
              },
            },
          ],
        },
      });
    });

    it('should preserve not-found semantics for getOne', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = parseQuery((qb) => qb.select(['name']));

      parsed.paramsFilter = [{ field: 'id', operator: '$eq', value: 404 }];
      delegate.findUnique.mockResolvedValue(null);

      await expect(service.getOne(createRequest(parsed))).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getOne(createRequest(parsed))).rejects.toThrow('User not found');
    });
  });
});
