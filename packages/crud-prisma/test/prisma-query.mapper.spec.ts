import { RequestQueryBuilder, RequestQueryParser } from '@nestjsx/crud-request';
import { mapCrudRequestToPrisma, PrismaCrudModelConfig } from '@nestjsx/crud-prisma';
import { parse } from 'qs';

function parseQuery(build: (qb: RequestQueryBuilder) => RequestQueryBuilder) {
  const qb = build(RequestQueryBuilder.create());
  const parser = RequestQueryParser.create();

  parser.parseQuery(parse(qb.query(false)));

  return parser.getParsed();
}

function getUserModelConfig(): PrismaCrudModelConfig {
  return {
    modelName: 'User',
    scalarFields: ['id', 'name', 'email', 'tenantId', 'deletedAt'],
    primaryKeys: ['id'],
    relationMap: {
      company: {
        type: 'one',
        scalarFields: ['id', 'name', 'updatedAt'],
        primaryKeys: ['id'],
        relationMap: {
          projects: {
            type: 'many',
            scalarFields: ['id', 'name', 'companyId'],
            primaryKeys: ['id'],
          },
        },
      },
      licenses: {
        type: 'many',
        scalarFields: ['id', 'key'],
        primaryKeys: ['id'],
      },
      profile: {
        type: 'one',
        scalarFields: ['id', 'bio'],
        primaryKeys: ['id'],
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

describe('#crud-prisma', () => {
  describe('#mapCrudRequestToPrisma', () => {
    it('should map fields, eager joins, and nested relation selections into Prisma select trees', () => {
      const parsed = parseQuery((qb) =>
        qb.select(['name']).setJoin({ field: 'company', select: ['name'] }).setJoin({ field: 'company.projects', select: ['name'] }),
      );

      const result = mapCrudRequestToPrisma(parsed, {
        model: getUserModelConfig(),
        query: {
          allow: ['id', 'name', 'email', 'deletedAt'],
          persist: ['email'],
          join: {
            company: {
              exclude: ['updatedAt'],
            },
            'company.projects': {
              alias: 'pr',
              allow: ['id', 'name'],
            },
            licenses: {
              eager: true,
              allow: ['id'],
            },
            profile: {
              eager: true,
              select: false,
            },
          },
        },
      });

      expect(result.args.select).toEqual({
        id: true,
        name: true,
        email: true,
        company: {
          select: {
            id: true,
            name: true,
            projects: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        licenses: {
          select: {
            id: true,
          },
        },
      });
    });

    it('should compose legacy filter, or, params, and soft-delete conditions into Prisma where', () => {
      const parsed = parseQuery((qb) =>
        qb
          .setFilter({ field: 'name', operator: 'notin', value: ['Name2', 'Name3'] })
          .setOr({ field: 'company.name', operator: 'cont', value: '5' }),
      );

      parsed.paramsFilter = [{ field: 'tenantId', operator: '$eq', value: 42 }];

      const result = mapCrudRequestToPrisma(parsed, {
        model: getUserModelConfig(),
        query: {
          filter: [{ field: 'id', operator: 'ne', value: 1 }],
          softDelete: true,
          join: {
            company: {},
          },
        },
      });

      expect(result.args.where).toEqual({
        AND: [
          {
            AND: [
              {
                tenantId: {
                  equals: 42,
                },
              },
              {
                id: {
                  not: 1,
                },
              },
              {
                OR: [
                  {
                    name: {
                      notIn: ['Name2', 'Name3'],
                    },
                  },
                  {
                    company: {
                      is: {
                        name: {
                          contains: 5,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          {
            deletedAt: null,
          },
        ],
      });
    });

    it('should map aliases, required joins, nested relation ordering, pagination, and cache hooks', () => {
      const parsed = parseQuery((qb) =>
        qb
          .search({
            id: { $notnull: true, $or: { $eq: 1, $in: [30, 31] } },
            'pr.name': { $startsL: 'Project' },
          })
          .setJoin({ field: 'company' })
          .setJoin({ field: 'company.projects' })
          .sortBy({ field: 'pr.id', order: 'DESC' })
          .setLimit(7)
          .setPage(2),
      );

      const cache = {
        get: jest.fn(),
      };
      const result = mapCrudRequestToPrisma(parsed, {
        model: getUserModelConfig(),
        cache,
        query: {
          cache: 300,
          maxLimit: 5,
          softDelete: true,
          join: {
            company: {},
            'company.projects': {
              alias: 'pr',
              required: true,
            },
          },
        },
      });

      expect(result.args.select).toEqual({
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
              orderBy: [{ id: 'desc' }],
            },
          },
        },
      });
      expect(result.args.where).toEqual({
        AND: [
          {
            AND: [
              {
                AND: [
                  {
                    id: {
                      not: null,
                    },
                  },
                  {
                    OR: [
                      {
                        id: {
                          equals: 1,
                        },
                      },
                      {
                        id: {
                          in: [30, 31],
                        },
                      },
                    ],
                  },
                ],
              },
              {
                company: {
                  is: {
                    projects: {
                      some: {
                        name: {
                          startsWith: 'Project',
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
          {
            company: {
              is: {
                projects: {
                  some: {},
                },
              },
            },
          },
          {
            deletedAt: null,
          },
        ],
      });
      expect(result.args.orderBy).toBeUndefined();
      expect(result.args.take).toBe(5);
      expect(result.args.skip).toBe(5);
      expect(result.cache.enabled).toBe(true);
      expect(result.cache.noop).toBe(false);
      expect(result.cache.extension).toBe(cache);
      expect(result.cache.key).toContain('"model":"User"');
    });

    it('should keep cache as a no-op without an extension hook and omit soft-delete filters when includeDeleted is set', () => {
      const parsed = parseQuery((qb) =>
        qb.setJoin({ field: 'company' }).sortBy({ field: 'company.id', order: 'DESC' }).setIncludeDeleted(1),
      );

      const result = mapCrudRequestToPrisma(parsed, {
        model: getUserModelConfig(),
        query: {
          cache: 120,
          softDelete: true,
          join: {
            company: {},
          },
        },
      });

      expect(result.args.orderBy).toEqual([{ company: { id: 'desc' } }]);
      expect(result.args.where).toBeUndefined();
      expect(result.cache.enabled).toBe(false);
      expect(result.cache.noop).toBe(true);
      expect(result.cache.note).toContain('no-op');
    });
  });
});
