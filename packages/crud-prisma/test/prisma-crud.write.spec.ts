import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrudRequest } from '@nestjsx/crud';
import { ParsedRequestParams } from '@nestjsx/crud-request';
import { PrismaCrudModelConfig, PrismaCrudService } from '@nestjsx/crud-prisma';

interface CompanyRecord {
  id: number;
  name: string;
}

interface UserRecord {
  id: number;
  name: string;
  email: string;
  companyId: number;
  deletedAt: Date | null;
  company?: CompanyRecord | null;
  profile?: unknown;
}

function createParsed(overrides: Partial<ParsedRequestParams> = {}): ParsedRequestParams {
  return {
    fields: [],
    paramsFilter: [],
    authPersist: {},
    classTransformOptions: {},
    search: undefined,
    filter: [],
    or: [],
    join: [],
    sort: [],
    limit: 0,
    offset: 0,
    page: 0,
    cache: 0,
    includeDeleted: 0,
    ...overrides,
  };
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

function getUserModelConfig(
  overrides: Partial<PrismaCrudModelConfig<UserRecord>> = {},
): PrismaCrudModelConfig<UserRecord> {
  return {
    modelName: 'User',
    scalarFields: ['id', 'name', 'email', 'companyId', 'deletedAt'],
    stringFields: ['name', 'email'],
    primaryKeys: ['id'],
    relationMap: {
      company: {
        type: 'one',
        scalarFields: ['id', 'name'],
        stringFields: ['name'],
        primaryKeys: ['id'],
      },
    },
    softDelete: {
      field: 'deletedAt',
      deletedValue: () => new Date('2026-04-06T12:00:00.000Z'),
      notDeletedValue: null,
    },
    whereUnique: (params, entity) => ({ id: entity && entity.id ? entity.id : params.id }),
    ...overrides,
  };
}

describe('#crud-prisma', () => {
  describe('#PrismaCrudService write behavior', () => {
    it('should normalize createOne payloads and refetch the created entity', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig({
          write: {
            normalizeCreate: ({ dto }) => ({
              ...dto,
              profile: {
                create: {
                  nickname: 'created-via-hook',
                },
              },
            }),
          },
        }),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'companyId', operator: '$eq', value: 10 }],
        authPersist: { email: 'auth@email.com' },
      });
      const created = {
        id: 7,
        name: 'Created User',
        email: 'auth@email.com',
        companyId: 10,
        deletedAt: null,
      };
      const refetched = {
        ...created,
        company: {
          id: 10,
          name: 'ACME',
        },
      };

      delegate.create.mockResolvedValue(created);
      delegate.findFirst.mockResolvedValue(refetched);

      await expect(
        service.createOne(
          createRequest(parsed, {
            query: {
              join: {
                company: {
                  eager: true,
                },
              },
            },
          }),
          {
            name: 'Created User',
            email: 'user@email.com',
            companyId: 99,
          },
        ),
      ).resolves.toEqual(refetched);

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          name: 'Created User',
          email: 'auth@email.com',
          companyId: 10,
          profile: {
            create: {
              nickname: 'created-via-hook',
            },
          },
        },
      });
      expect(delegate.findFirst).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
          deletedAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        where: {
          AND: [
            {
              companyId: {
                equals: 10,
              },
            },
            {
              id: {
                equals: 7,
              },
            },
          ],
        },
      });
    });

    it('should return createOne results directly when returnShallow is enabled', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const created = {
        id: 8,
        name: 'Shallow User',
        email: 'shallow@email.com',
        companyId: 3,
        deletedAt: null,
      };

      delegate.create.mockResolvedValue(created);

      await expect(
        service.createOne(
          createRequest(createParsed(), {
            routes: {
              createOneBase: {
                returnShallow: true,
              },
            },
          }),
          {
            name: 'Shallow User',
            email: 'shallow@email.com',
            companyId: 3,
          },
        ),
      ).resolves.toEqual(created);

      expect(delegate.findUnique).not.toHaveBeenCalled();
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('should drop unsupported nested write payloads unless a write hook adds them', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const created = {
        id: 12,
        name: 'Scalar Only',
        email: 'scalar@email.com',
        companyId: 4,
        deletedAt: null,
      };

      delegate.create.mockResolvedValue(created);

      await expect(
        service.createOne(
          createRequest(createParsed(), {
            routes: {
              createOneBase: {
                returnShallow: true,
              },
            },
          }),
          {
            name: 'Scalar Only',
            email: 'scalar@email.com',
            companyId: 4,
            company: {
              connect: {
                id: 4,
              },
            },
            profile: {
              create: {
                nickname: 'should-not-pass-through',
              },
            },
            ignored: 'value',
          } as any,
        ),
      ).resolves.toEqual(created);

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          name: 'Scalar Only',
          email: 'scalar@email.com',
          companyId: 4,
        },
      });
    });

    it('should reject empty bulk payloads for createMany', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });

      await expect(service.createMany(createRequest(createParsed()), { bulk: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('should reject bulk payloads when write normalization removes every item', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig({
          write: {
            normalizeCreate: () => undefined as any,
          },
        }),
      });

      await expect(
        service.createMany(createRequest(createParsed()), {
          bulk: [{ name: 'Removed 1' } as any, { name: 'Removed 2' } as any],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('should create each valid bulk item after write normalization', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'companyId', operator: '$eq', value: 12 }],
        authPersist: { email: 'bulk@email.com' },
      });
      const created = {
        id: 1,
        name: 'Bulk User',
        email: 'bulk@email.com',
        companyId: 12,
        deletedAt: null,
      };

      delegate.create.mockResolvedValue(created);

      await expect(
        service.createMany(createRequest(parsed), {
          bulk: [null as any, { name: 'Bulk User' } as any, undefined as any],
        }),
      ).resolves.toEqual([created]);

      expect(delegate.create).toHaveBeenCalledTimes(1);
      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          name: 'Bulk User',
          email: 'bulk@email.com',
          companyId: 12,
        },
      });
    });

    it('should allow successful createMany calls without a delete delegate', async () => {
      const delegate = {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      };
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const created = {
        id: 51,
        name: 'Create Only User',
        email: 'create-only@email.com',
        companyId: 4,
        deletedAt: null,
      };

      delegate.create.mockResolvedValue(created);

      await expect(
        service.createMany(createRequest(createParsed()), {
          bulk: [
            {
              name: 'Create Only User',
              email: 'create-only@email.com',
              companyId: 4,
            } as any,
          ],
        }),
      ).resolves.toEqual([created]);

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          name: 'Create Only User',
          email: 'create-only@email.com',
          companyId: 4,
        },
      });
    });

    it('should roll back earlier bulk inserts when a later createMany item fails', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const created = {
        id: 41,
        name: 'First User',
        email: 'first@email.com',
        companyId: 4,
        deletedAt: null,
      };
      const failure = new Error('createMany failed');

      delegate.create.mockResolvedValueOnce(created).mockRejectedValueOnce(failure);
      delegate.delete.mockResolvedValue(created);

      await expect(
        service.createMany(createRequest(createParsed()), {
          bulk: [
            {
              name: 'First User',
              email: 'first@email.com',
              companyId: 4,
            } as any,
            {
              name: 'Second User',
              email: 'second@email.com',
              companyId: 4,
            } as any,
          ],
        }),
      ).rejects.toBe(failure);

      expect(delegate.create).toHaveBeenCalledTimes(2);
      expect(delegate.delete).toHaveBeenCalledWith({
        where: {
          id: 41,
        },
      });
    });

    it('should bypass request cache when resolving and refetching mutation targets', async () => {
      const delegate = createDelegate();
      const cache = {
        get: jest.fn().mockResolvedValue({
          id: 5,
          name: 'Cached User',
          email: 'cached@email.com',
          companyId: 3,
          deletedAt: null,
        }),
        set: jest.fn(),
      };
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
        cache,
        query: {
          cache: 60,
        },
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 5 }],
      });
      const found = {
        id: 5,
        name: 'Before Update',
        email: 'before@email.com',
        companyId: 3,
        deletedAt: null,
      };
      const updated = {
        ...found,
        name: 'After Update',
      };

      delegate.findUnique.mockResolvedValueOnce(found).mockResolvedValueOnce(updated);
      delegate.update.mockResolvedValue(updated);

      await expect(service.updateOne(createRequest(parsed), { name: 'After Update' } as any)).resolves.toEqual(updated);

      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
      expect(delegate.findUnique).toHaveBeenCalledTimes(2);
    });

    it('should use a scoped two-step lookup for updateOne and refetch inside the original scope', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'companyId', operator: '$eq', value: 1 }],
        search: {
          companyId: 1,
        },
        authPersist: {
          email: 'auth@email.com',
        },
      });
      const found = {
        id: 3,
        name: 'Before Update',
        email: 'before@email.com',
        companyId: 1,
        deletedAt: null,
      };
      const updated = {
        ...found,
        name: 'After Update',
        email: 'auth@email.com',
      };
      const refetched = {
        ...updated,
        company: {
          id: 1,
          name: 'ACME',
        },
      };

      delegate.findFirst.mockResolvedValueOnce(found);
      delegate.update.mockResolvedValue(updated);
      delegate.findFirst.mockResolvedValueOnce(refetched);

      await expect(
        service.updateOne(
          createRequest(parsed, {
            query: {
              join: {
                company: {
                  eager: true,
                },
              },
            },
          }),
          {
            name: 'After Update',
            email: 'user@email.com',
            companyId: 99,
          },
        ),
      ).resolves.toEqual(refetched);

      expect(delegate.findFirst).toHaveBeenCalledTimes(2);
      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 3,
        },
        data: {
          id: 3,
          name: 'After Update',
          email: 'auth@email.com',
          companyId: 1,
          deletedAt: null,
        },
      });
      expect(delegate.findFirst).toHaveBeenLastCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
          deletedAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        where: {
          AND: [
            {
              companyId: {
                equals: 1,
              },
            },
            {
              id: {
                equals: 3,
              },
            },
          ],
        },
      });
    });

    it('should allow params override for updateOne when configured', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [
          { field: 'id', operator: '$eq', value: 4 },
          { field: 'companyId', operator: '$eq', value: 1 },
        ],
      });
      const found = {
        id: 4,
        name: 'Before',
        email: 'before@email.com',
        companyId: 1,
        deletedAt: null,
      };
      const updated = {
        ...found,
        companyId: 9,
      };

      delegate.findFirst.mockResolvedValue(found);
      delegate.update.mockResolvedValue(updated);

      await expect(
        service.updateOne(
          createRequest(parsed, {
            routes: {
              updateOneBase: {
                allowParamsOverride: true,
                returnShallow: true,
              },
            },
          }),
          {
            companyId: 9,
          },
        ),
      ).resolves.toEqual(updated);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 4,
        },
        data: {
          id: 4,
          name: 'Before',
          email: 'before@email.com',
          companyId: 9,
          deletedAt: null,
        },
      });
      expect(delegate.findUnique).not.toHaveBeenCalled();
    });

    it('should create a new entity during replaceOne when the target is missing', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 404 }],
      });
      const created = {
        id: 405,
        name: 'Replacement',
        email: 'replacement@email.com',
        companyId: 5,
        deletedAt: null,
      };

      delegate.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(created);
      delegate.create.mockResolvedValue(created);

      await expect(
        service.replaceOne(
          createRequest(parsed),
          {
            name: 'Replacement',
            email: 'replacement@email.com',
            companyId: 5,
          },
        ),
      ).resolves.toEqual(created);

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          id: 404,
          name: 'Replacement',
          email: 'replacement@email.com',
          companyId: 5,
        },
      });
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('should support params override ordering for replaceOne', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [
          { field: 'id', operator: '$eq', value: 11 },
          { field: 'companyId', operator: '$eq', value: 1 },
        ],
      });
      const found = {
        id: 11,
        name: 'Before Replace',
        email: 'before@email.com',
        companyId: 1,
        deletedAt: null,
      };
      const replaced = {
        ...found,
        companyId: 22,
        name: 'After Replace',
      };

      delegate.findFirst.mockResolvedValue(found);
      delegate.update.mockResolvedValue(replaced);

      await expect(
        service.replaceOne(
          createRequest(parsed, {
            routes: {
              replaceOneBase: {
                allowParamsOverride: true,
                returnShallow: true,
              },
            },
          }),
          {
            name: 'After Replace',
            companyId: 22,
          },
        ),
      ).resolves.toEqual(replaced);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 11,
        },
        data: {
          id: 11,
          name: 'After Replace',
          email: 'before@email.com',
          companyId: 22,
          deletedAt: null,
        },
      });
      expect(delegate.findUnique).not.toHaveBeenCalled();
    });

    it('should refetch replaceOne with the new primary key when params override changes a route primary param', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [
          { field: 'id', operator: '$eq', value: 11 },
          { field: 'companyId', operator: '$eq', value: 1 },
        ],
        search: {
          $and: [
            {
              id: {
                $eq: 11,
              },
            },
            {
              companyId: {
                $eq: 1,
              },
            },
          ],
        } as any,
      });
      const found = {
        id: 11,
        name: 'Before Replace',
        email: 'before@email.com',
        companyId: 1,
        deletedAt: null,
      };
      const replaced = {
        ...found,
        id: 22,
        name: 'After Replace',
      };
      const refetched = {
        ...replaced,
        company: {
          id: 1,
          name: 'Refetched Co',
        },
      };

      delegate.findFirst.mockResolvedValueOnce(found).mockResolvedValueOnce(refetched);
      delegate.update.mockResolvedValue(replaced);

      await expect(
        service.replaceOne(
          createRequest(parsed, {
            query: {
              join: {
                company: {
                  eager: true,
                },
              },
            },
            routes: {
              replaceOneBase: {
                allowParamsOverride: true,
              },
            },
          }),
          {
            id: 22,
            name: 'After Replace',
          },
        ),
      ).resolves.toEqual(refetched);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 11,
        },
        data: {
          id: 22,
          name: 'After Replace',
          email: 'before@email.com',
          companyId: 1,
          deletedAt: null,
        },
      });
      expect(delegate.findFirst).toHaveBeenLastCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
          deletedAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        where: {
          AND: [
            {
              companyId: {
                equals: 1,
              },
            },
            {
              id: {
                equals: 22,
              },
            },
          ],
        },
      });
    });

    it('should refetch replaceOne updates when returnShallow is disabled', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 21 }],
      });
      const found = {
        id: 21,
        name: 'Before Replace',
        email: 'before@email.com',
        companyId: 2,
        deletedAt: null,
      };
      const replaced = {
        ...found,
        name: 'After Replace',
      };
      const refetched = {
        ...replaced,
        company: {
          id: 2,
          name: 'After Replace Co',
        },
      };

      delegate.findUnique.mockResolvedValueOnce(found).mockResolvedValueOnce(refetched);
      delegate.update.mockResolvedValue(replaced);

      await expect(
        service.replaceOne(
          createRequest(parsed, {
            query: {
              join: {
                company: {
                  eager: true,
                },
              },
            },
          }),
          {
            name: 'After Replace',
          },
        ),
      ).resolves.toEqual(refetched);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 21,
        },
        data: {
          id: 21,
          name: 'After Replace',
          email: 'before@email.com',
          companyId: 2,
          deletedAt: null,
        },
      });
      expect(delegate.findUnique).toHaveBeenLastCalledWith({
        where: {
          id: 21,
        },
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
          deletedAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    });

    it('should soft delete through updateOne semantics and return the pre-delete entity', async () => {
      const deletedAt = new Date('2026-04-06T12:00:00.000Z');
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig({
          write: {
            normalizeDelete: () => ({
              auditId: 'user-9-delete',
            }),
          },
        }),
      });
      const parsed = createParsed({
        search: {
          id: 9,
        },
      });
      const found = {
        id: 9,
        name: 'Delete Me',
        email: 'delete@email.com',
        companyId: 3,
        deletedAt: null,
      };

      delegate.findFirst.mockResolvedValue(found);
      delegate.update.mockResolvedValue({
        ...found,
        deletedAt,
      });

      await expect(
        service.deleteOne(
          createRequest(parsed, {
            query: {
              softDelete: true,
            },
            routes: {
              deleteOneBase: {
                returnDeleted: true,
              },
            },
          }),
        ),
      ).resolves.toEqual(found);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          auditId: 'user-9-delete',
        },
        data: {
          deletedAt,
        },
      });
      expect(delegate.delete).not.toHaveBeenCalled();
    });

    it('should include soft-deleted rows in deleteOne lookups when returnDeleted is enabled', async () => {
      const deletedAt = new Date('2026-04-06T12:00:00.000Z');
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 9 }],
      });
      const found = {
        id: 9,
        name: 'Already Deleted',
        email: 'already-deleted@email.com',
        companyId: 3,
        deletedAt,
      };

      delegate.findFirst.mockResolvedValue(found);
      delegate.update.mockResolvedValue(found);

      await expect(
        service.deleteOne(
          createRequest(parsed, {
            query: {
              softDelete: true,
            },
            routes: {
              deleteOneBase: {
                returnDeleted: true,
              },
            },
          }),
        ),
      ).resolves.toEqual(found);

      expect(delegate.findFirst).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          companyId: true,
          deletedAt: true,
        },
        where: {
          id: {
            equals: 9,
          },
        },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 9,
        },
        data: {
          deletedAt,
        },
      });
    });

    it('should recover soft-deleted rows through explicit soft-delete config', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 5 }],
      });
      const deleted = {
        id: 5,
        name: 'Deleted User',
        email: 'deleted@email.com',
        companyId: 2,
        deletedAt: new Date('2026-04-01T00:00:00.000Z'),
      };
      const recovered = {
        ...deleted,
        deletedAt: null,
      };
      const refetched = {
        ...recovered,
        company: {
          id: 2,
          name: 'Recovered Co',
        },
      };

      delegate.findFirst.mockResolvedValueOnce(deleted).mockResolvedValueOnce(refetched);
      delegate.update.mockResolvedValue(recovered);

      await expect(
        service.recoverOne(
          createRequest(parsed, {
            query: {
              softDelete: true,
              join: {
                company: {
                  eager: true,
                },
              },
            },
            routes: {
              recoverOneBase: {
                returnRecovered: true,
              },
            },
          }),
        ),
      ).resolves.toEqual(refetched);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 5,
        },
        data: {
          deletedAt: null,
        },
      });
      expect(delegate.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should return no body for recoverOne when returnRecovered is disabled', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 5 }],
      });
      const deleted = {
        id: 5,
        name: 'Deleted User',
        email: 'deleted@email.com',
        companyId: 2,
        deletedAt: new Date('2026-04-01T00:00:00.000Z'),
      };

      delegate.findFirst.mockResolvedValue(deleted);
      delegate.update.mockResolvedValue({
        ...deleted,
        deletedAt: null,
      });

      await expect(
        service.recoverOne(
          createRequest(parsed, {
            query: {
              softDelete: true,
            },
          }),
        ),
      ).resolves.toBeUndefined();

      expect(delegate.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should preserve not-found semantics for replaceOne target resolution errors', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        paramsFilter: [{ field: 'id', operator: '$eq', value: 99 }],
      });

      delegate.findUnique.mockResolvedValue(null);
      delegate.create.mockRejectedValue(new NotFoundException('downstream write failed'));

      await expect(service.replaceOne(createRequest(parsed), { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
