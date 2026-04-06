import {
  definePrismaCrudModelConfig,
  definePrismaCrudOptions,
  PRISMA_CRUD_COMPATIBILITY,
  PrismaCrudModelConfig,
  validatePrismaCrudModelConfig,
} from '@nestjsx/crud-prisma';

interface CompanyRecord {
  companyId: number;
  name: string;
  deletedAt: Date | null;
}

function getValidModelConfig(): PrismaCrudModelConfig<CompanyRecord> {
  return {
    modelName: 'Company',
    scalarFields: ['companyId', 'name', 'deletedAt'],
    primaryKeys: ['companyId'],
    relationMap: {
      projects: {
        type: 'many',
        scalarFields: ['projectId', 'title', 'companyId'],
        primaryKeys: ['projectId'],
        relationMap: {
          owner: {
            type: 'one',
            scalarFields: ['userId', 'email'],
            primaryKeys: ['userId'],
            alias: 'projectOwner',
          },
        },
      },
    },
    softDelete: {
      field: 'deletedAt',
      deletedValue: () => new Date(),
      notDeletedValue: null,
    },
    whereUnique: (params) => ({ companyId: params.companyId }),
    write: {
      normalizeCreate: ({ dto }) => dto,
    },
  };
}

describe('#crud-prisma', () => {
  describe('#package exports', () => {
    it('should expose the public contract and compatibility matrix', () => {
      expect(definePrismaCrudModelConfig).toBeFunction();
      expect(validatePrismaCrudModelConfig).toBeFunction();
      expect(definePrismaCrudOptions).toBeFunction();
      expect(PRISMA_CRUD_COMPATIBILITY.supported).toContain('Scalar field selection through scalarFields.');
      expect(PRISMA_CRUD_COMPATIBILITY.notes.cache).toContain('no-op');
      expect(PRISMA_CRUD_COMPATIBILITY.notes.joinAliases).toContain('compatibility metadata');
    });
  });

  describe('#definePrismaCrudModelConfig', () => {
    it('should accept nested relations, compound metadata, and soft delete config', () => {
      const config = definePrismaCrudModelConfig(getValidModelConfig());

      expect(config.modelName).toBe('Company');
      expect(config.primaryKeys).toEqual(['companyId']);
      expect(config.relationMap.projects.relationMap.owner.alias).toBe('projectOwner');
      expect(config.whereUnique({ companyId: 7 })).toEqual({ companyId: 7 });
    });

    it('should reject primary keys that are not declared in scalarFields', () => {
      expect(() =>
        definePrismaCrudModelConfig({
          ...getValidModelConfig(),
          primaryKeys: ['missingField'],
        }),
      ).toThrow('primaryKeys');
    });

    it('should reject dotted relation names and invalid soft delete fields', () => {
      expect(() =>
        definePrismaCrudModelConfig({
          ...getValidModelConfig(),
          relationMap: {
            'projects.owner': {
              type: 'one',
              scalarFields: ['userId'],
            },
          },
        }),
      ).toThrow('nested relationMap entries');

      expect(() =>
        definePrismaCrudModelConfig({
          ...getValidModelConfig(),
          softDelete: {
            field: 'missingField',
            deletedValue: true,
            notDeletedValue: false,
          },
        }),
      ).toThrow('softDelete.field');
    });

    it('should reject soft delete configs with an undefined notDeletedValue', () => {
      expect(() =>
        definePrismaCrudModelConfig({
          ...getValidModelConfig(),
          softDelete: {
            field: 'deletedAt',
            deletedValue: true,
            notDeletedValue: undefined,
          },
        }),
      ).toThrow('softDelete.notDeletedValue must not be undefined');
    });
  });

  describe('#definePrismaCrudOptions', () => {
    it('should validate the model contract and optional cache extension hook', () => {
      const options = definePrismaCrudOptions({
        model: getValidModelConfig(),
        cache: {
          get: jest.fn(),
        },
      });

      expect(options.model.modelName).toBe('Company');
      expect(options.cache.get).toBeFunction();
    });

    it('should reject cache objects without hook functions', () => {
      expect(() =>
        definePrismaCrudOptions({
          model: getValidModelConfig(),
          cache: {},
        }),
      ).toThrow('cache must expose get() or set()');
    });
  });
});
