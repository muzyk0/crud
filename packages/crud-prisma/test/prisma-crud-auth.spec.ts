import { NotFoundException } from '@nestjs/common';
import { CrudRequest } from '@nestjsx/crud';
import { ParsedRequestParams } from '@nestjsx/crud-request';
import { PrismaCrudModelConfig, PrismaCrudService } from '@nestjsx/crud-prisma';

interface ProjectRecord {
  id: number;
  name: string;
  description: string;
  companyId: number;
}

interface UserRecord {
  id: number;
  email: string;
  isActive: boolean;
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

function getProjectModelConfig(): PrismaCrudModelConfig<ProjectRecord> {
  return {
    modelName: 'Project',
    scalarFields: ['id', 'name', 'description', 'companyId'],
    primaryKeys: ['id'],
    whereUnique: (params, entity) => ({ id: entity && entity.id ? entity.id : params.id }),
  };
}

function getUserModelConfig(): PrismaCrudModelConfig<UserRecord> {
  return {
    modelName: 'User',
    scalarFields: ['id', 'email', 'isActive'],
    primaryKeys: ['id'],
    whereUnique: (params, entity) => ({ id: entity && entity.id ? entity.id : params.id }),
  };
}

describe('#crud-prisma', () => {
  describe('#PrismaCrudService auth behavior', () => {
    it('should enforce authPersist values during updateOne', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getUserModelConfig(),
      });
      const parsed = createParsed({
        search: {
          id: 1,
        },
        authPersist: {
          email: '1@email.com',
        },
      });
      const found = {
        id: 1,
        email: 'before@email.com',
        isActive: true,
      };
      const updated = {
        id: 1,
        email: '1@email.com',
        isActive: false,
      };

      delegate.findFirst.mockResolvedValue(found);
      delegate.update.mockResolvedValue(updated);

      await expect(
        service.updateOne(
          createRequest(parsed, {
            routes: {
              updateOneBase: {
                returnShallow: true,
              },
            },
          }),
          {
            email: 'user@email.com',
            isActive: false,
          },
        ),
      ).resolves.toEqual(updated);

      expect(delegate.update).toHaveBeenCalledWith({
        where: {
          id: 1,
        },
        data: {
          id: 1,
          email: '1@email.com',
          isActive: false,
        },
      });
    });

    it('should enforce authPersist values during createOne', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getProjectModelConfig(),
      });
      const parsed = createParsed({
        authPersist: {
          companyId: 1,
        },
      });
      const created = {
        id: 22,
        name: 'Auth Project',
        description: 'foo',
        companyId: 1,
      };

      delegate.create.mockResolvedValue(created);

      await expect(
        service.createOne(
          createRequest(parsed, {
            routes: {
              createOneBase: {
                returnShallow: true,
              },
            },
          }),
          {
            name: 'Auth Project',
            description: 'foo',
            companyId: 10,
          },
        ),
      ).resolves.toEqual(created);

      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          name: 'Auth Project',
          description: 'foo',
          companyId: 1,
        },
      });
    });

    it('should honor auth filters during deleteOne lookups', async () => {
      const delegate = createDelegate();
      const service = new PrismaCrudService(delegate, {
        model: getProjectModelConfig(),
      });
      const parsed = createParsed({
        search: {
          companyId: 1,
          id: 20,
        },
      });

      delegate.findFirst.mockResolvedValue(null);

      await expect(service.deleteOne(createRequest(parsed))).rejects.toBeInstanceOf(NotFoundException);

      expect(delegate.delete).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });
});
