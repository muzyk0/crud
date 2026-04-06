export type PrismaCrudWhereUniqueInput = Record<string, unknown>;

export type PrismaCrudRelationType = 'one' | 'many';

export interface PrismaCrudSoftDeleteConfig {
  field: string;
  deletedValue: unknown | (() => unknown);
  notDeletedValue: unknown;
}

export interface PrismaCrudRelationConfig {
  type: PrismaCrudRelationType;
  scalarFields: string[];
  stringFields?: string[];
  primaryKeys?: string[];
  relationMap?: PrismaCrudRelationMap;
  alias?: string;
}

export interface PrismaCrudRelationMap {
  [name: string]: PrismaCrudRelationConfig;
}

export interface PrismaCrudWriteHookContext<TModel = unknown, TPayload = unknown> {
  dto: TPayload;
  paramsFilter?: Record<string, unknown>;
  authPersist?: Record<string, unknown>;
  existing?: TModel | null;
}

export interface PrismaCrudWriteHooks<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>> {
  normalizeCreate?(context: PrismaCrudWriteHookContext<TModel, TCreate>): TCreate | Promise<TCreate>;
  normalizeUpdate?(context: PrismaCrudWriteHookContext<TModel, TUpdate>): TUpdate | Promise<TUpdate>;
  normalizeReplace?(context: PrismaCrudWriteHookContext<TModel, TUpdate>): TUpdate | Promise<TUpdate>;
  normalizeDelete?(
    context: PrismaCrudWriteHookContext<TModel, void>,
  ): PrismaCrudWhereUniqueInput | void | Promise<PrismaCrudWhereUniqueInput | void>;
  normalizeRecover?(
    context: PrismaCrudWriteHookContext<TModel, void>,
  ): PrismaCrudWhereUniqueInput | void | Promise<PrismaCrudWhereUniqueInput | void>;
}

export interface PrismaCrudModelConfig<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>> {
  modelName: string;
  scalarFields: string[];
  stringFields?: string[];
  relationMap?: PrismaCrudRelationMap;
  primaryKeys: string[];
  softDelete?: PrismaCrudSoftDeleteConfig;
  whereUnique(params: Record<string, unknown>, entity?: TModel | null): PrismaCrudWhereUniqueInput;
  write?: PrismaCrudWriteHooks<TModel, TCreate, TUpdate>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertStringArray(fieldName: string, value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`crud-prisma: ${fieldName} must be a non-empty string array`);
  }

  if (value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`crud-prisma: ${fieldName} must contain only non-empty strings`);
  }

  if (new Set(value).size !== value.length) {
    throw new Error(`crud-prisma: ${fieldName} must not contain duplicates`);
  }

  return value;
}

function assertSubset(fieldName: string, values: string[], parentFieldName: string, source: string[]): void {
  const missing = values.filter((value) => !source.includes(value));

  if (missing.length) {
    throw new Error(`crud-prisma: ${fieldName} must reference ${parentFieldName}; missing ${missing.join(', ')}`);
  }
}

function validateSoftDeleteConfig(fieldName: string, value: unknown, scalarFields: string[]): void {
  if (!isObject(value)) {
    throw new Error(`crud-prisma: ${fieldName} must be an object`);
  }

  if (typeof value.field !== 'string' || value.field.trim().length === 0) {
    throw new Error(`crud-prisma: ${fieldName}.field must be a non-empty string`);
  }

  if (!scalarFields.includes(value.field)) {
    throw new Error(`crud-prisma: ${fieldName}.field must be declared in scalarFields`);
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'deletedValue')) {
    throw new Error(`crud-prisma: ${fieldName}.deletedValue must be provided`);
  }

  const deletedValue = value.deletedValue;

  if (typeof deletedValue === 'undefined') {
    throw new Error(`crud-prisma: ${fieldName}.deletedValue must not be undefined`);
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'notDeletedValue')) {
    throw new Error(`crud-prisma: ${fieldName}.notDeletedValue must be provided`);
  }

  if (typeof value.notDeletedValue === 'undefined') {
    throw new Error(`crud-prisma: ${fieldName}.notDeletedValue must not be undefined`);
  }
}

function validateRelationMap(fieldName: string, relationMap: unknown): void {
  if (!isObject(relationMap)) {
    throw new Error(`crud-prisma: ${fieldName} must be an object`);
  }

  Object.entries(relationMap).forEach(([relationName, relationConfig]) => {
    const relationFieldName = `${fieldName}.${relationName}`;

    if (relationName.includes('.')) {
      throw new Error(`crud-prisma: ${relationFieldName} must use nested relationMap entries instead of dotted names`);
    }

    if (!isObject(relationConfig)) {
      throw new Error(`crud-prisma: ${relationFieldName} must be an object`);
    }

    if (relationConfig.type !== 'one' && relationConfig.type !== 'many') {
      throw new Error(`crud-prisma: ${relationFieldName}.type must be one of one, many`);
    }

    const scalarFields = assertStringArray(`${relationFieldName}.scalarFields`, relationConfig.scalarFields);

    if (typeof relationConfig.alias !== 'undefined' && (typeof relationConfig.alias !== 'string' || relationConfig.alias.trim().length === 0)) {
      throw new Error(`crud-prisma: ${relationFieldName}.alias must be a non-empty string when provided`);
    }

    if (typeof relationConfig.stringFields !== 'undefined') {
      const stringFields = assertStringArray(`${relationFieldName}.stringFields`, relationConfig.stringFields);

      assertSubset(`${relationFieldName}.stringFields`, stringFields, `${relationFieldName}.scalarFields`, scalarFields);
    }

    if (typeof relationConfig.primaryKeys !== 'undefined') {
      const primaryKeys = assertStringArray(`${relationFieldName}.primaryKeys`, relationConfig.primaryKeys);

      assertSubset(`${relationFieldName}.primaryKeys`, primaryKeys, `${relationFieldName}.scalarFields`, scalarFields);
    }

    if (typeof relationConfig.relationMap !== 'undefined') {
      validateRelationMap(`${relationFieldName}.relationMap`, relationConfig.relationMap);
    }
  });
}

export function validatePrismaCrudModelConfig<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  config: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
): PrismaCrudModelConfig<TModel, TCreate, TUpdate> {
  if (!isObject(config)) {
    throw new Error('crud-prisma: model config must be an object');
  }

  if (typeof config.modelName !== 'string' || config.modelName.trim().length === 0) {
    throw new Error('crud-prisma: modelName must be a non-empty string');
  }

  const scalarFields = assertStringArray('scalarFields', config.scalarFields);
  const primaryKeys = assertStringArray('primaryKeys', config.primaryKeys);

  assertSubset('primaryKeys', primaryKeys, 'scalarFields', scalarFields);

  if (typeof config.stringFields !== 'undefined') {
    const stringFields = assertStringArray('stringFields', config.stringFields);

    assertSubset('stringFields', stringFields, 'scalarFields', scalarFields);
  }

  if (typeof config.whereUnique !== 'function') {
    throw new Error('crud-prisma: whereUnique must be a function');
  }

  if (typeof config.relationMap !== 'undefined') {
    validateRelationMap('relationMap', config.relationMap);
  }

  if (typeof config.softDelete !== 'undefined') {
    validateSoftDeleteConfig('softDelete', config.softDelete, scalarFields);
  }

  if (typeof config.write !== 'undefined' && !isObject(config.write)) {
    throw new Error('crud-prisma: write must be an object when provided');
  }

  return config;
}

export function definePrismaCrudModelConfig<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  config: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
): PrismaCrudModelConfig<TModel, TCreate, TUpdate> {
  return validatePrismaCrudModelConfig(config);
}
