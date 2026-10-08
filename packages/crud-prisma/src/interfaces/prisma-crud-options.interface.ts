import { CrudRequestOptions } from '@nestjsx/crud';

import { PrismaCrudModelConfig, validatePrismaCrudModelConfig } from './prisma-crud-model-config.interface';

export interface PrismaCrudCacheExtension {
  get?(key: string): unknown | Promise<unknown>;
  set?(key: string, value: unknown, ttl?: number): void | Promise<void>;
}

export interface PrismaCrudOptions<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>
  extends CrudRequestOptions {
  model: PrismaCrudModelConfig<TModel, TCreate, TUpdate>;
  cache?: PrismaCrudCacheExtension;
}

export const PRISMA_CRUD_COMPATIBILITY = {
  goals: [
    'Keep @nestjsx/crud controllers and request parsing in place while replacing only the ORM service layer.',
    'Map CrudRequest.parsed and CrudOptions.query into explicit Prisma args through model metadata instead of reflection.',
  ],
  supported: [
    'Scalar field selection through scalarFields.',
    'Relation traversal through relationMap, including nested relation metadata.',
    'Compound primary keys and soft delete through explicit model configuration.',
    'Write normalization through optional create, update, replace, delete, and recover hooks.',
  ],
  nonGoals: [
    'TypeORM runtime metadata parity or inferred relation discovery.',
    'Implicit nested writes or cascade behavior.',
    'Transparent query-cache parity without an explicit extension hook.',
  ],
  notes: {
    cache:
      'Request-level cache settings are a no-op by default and only become active when PrismaCrudOptions.cache is provided.',
    joinAliases: 'Join aliases remain compatibility metadata only and do not drive Prisma query generation.',
    softDelete: 'Soft delete behavior must be declared through softDelete config rather than ORM-specific decorators.',
  },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function definePrismaCrudOptions<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  options: PrismaCrudOptions<TModel, TCreate, TUpdate>,
): PrismaCrudOptions<TModel, TCreate, TUpdate> {
  if (!isObject(options)) {
    throw new Error('crud-prisma: options must be an object');
  }

  validatePrismaCrudModelConfig(options.model);

  if (typeof options.cache !== 'undefined') {
    if (!isObject(options.cache)) {
      throw new Error('crud-prisma: cache must be an object when provided');
    }

    const hasGet = typeof options.cache.get === 'function';
    const hasSet = typeof options.cache.set === 'function';

    if (!hasGet && !hasSet) {
      throw new Error('crud-prisma: cache must expose get() or set() when provided');
    }
  }

  return options;
}
