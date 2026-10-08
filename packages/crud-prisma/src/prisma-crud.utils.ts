import { CrudRequestOptions, ParamsOptions, QueryOptions, RoutesOptions } from '@nestjsx/crud';
import { ParsedRequestParams } from '@nestjsx/crud-request';

import { PrismaCrudWhereUniqueInput, PrismaCrudModelConfig } from './interfaces/prisma-crud-model-config.interface';
import { definePrismaCrudOptions, PrismaCrudOptions } from './interfaces/prisma-crud-options.interface';
import { PrismaCrudQueryArgs } from './prisma-query.mapper';
import { PrismaCrudWhere } from './prisma-where.helper';

export type PrismaCrudFindManyArgs = PrismaCrudQueryArgs;

export type PrismaCrudFindOneArgs = PrismaCrudQueryArgs;

export interface PrismaCrudFindUniqueArgs {
  where: PrismaCrudWhereUniqueInput;
  select: PrismaCrudQueryArgs['select'];
}

export interface PrismaCrudCreateArgs<TData = unknown> {
  data: TData;
  select?: PrismaCrudQueryArgs['select'];
}

export interface PrismaCrudUpdateArgs<TData = unknown> {
  where: PrismaCrudWhereUniqueInput;
  data: TData;
  select?: PrismaCrudQueryArgs['select'];
}

export interface PrismaCrudDeleteArgs {
  where: PrismaCrudWhereUniqueInput;
  select?: PrismaCrudQueryArgs['select'];
}

export interface PrismaCrudCountArgs {
  where?: PrismaCrudWhere;
}

export interface PrismaCrudDelegate<TModel = unknown> {
  findMany(args?: PrismaCrudFindManyArgs): Promise<TModel[]>;
  findFirst(args?: PrismaCrudFindOneArgs): Promise<TModel | null>;
  findUnique?(args: PrismaCrudFindUniqueArgs): Promise<TModel | null>;
  count(args?: PrismaCrudCountArgs): Promise<number>;
  create?(args: PrismaCrudCreateArgs): Promise<TModel>;
  update?(args: PrismaCrudUpdateArgs): Promise<TModel>;
  delete?(args: PrismaCrudDeleteArgs): Promise<TModel>;
}

type PrismaCrudMutationMethod = 'create' | 'update' | 'delete';

export type PrismaCrudServiceOptions<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>> = Pick<
  PrismaCrudOptions<TModel, TCreate, TUpdate>,
  'cache' | 'model' | 'params' | 'query' | 'routes'
>;

function normalizeQueryOptions(query?: QueryOptions): QueryOptions {
  return query || {};
}

function normalizeRouteOptions(routes?: RoutesOptions): RoutesOptions {
  return routes || {};
}

function normalizeParamsOptions(params?: ParamsOptions): ParamsOptions {
  return params || {};
}

export function assertPrismaCrudDelegate<TModel = unknown>(
  delegate: PrismaCrudDelegate<TModel>,
): PrismaCrudDelegate<TModel> {
  if (
    !delegate ||
    typeof delegate.findMany !== 'function' ||
    typeof delegate.findFirst !== 'function' ||
    typeof delegate.count !== 'function'
  ) {
    throw new Error('crud-prisma: delegate must expose findMany(), findFirst(), and count()');
  }

  return delegate;
}

export function assertPrismaCrudDelegateMethod<TModel = unknown, TMethod extends PrismaCrudMutationMethod = PrismaCrudMutationMethod>(
  delegate: PrismaCrudDelegate<TModel>,
  method: TMethod,
): NonNullable<PrismaCrudDelegate<TModel>[TMethod]> {
  if (!delegate || typeof delegate[method] !== 'function') {
    throw new Error(`crud-prisma: delegate must expose ${method}() for mutation operations`);
  }

  return delegate[method] as NonNullable<PrismaCrudDelegate<TModel>[TMethod]>;
}

export function mergePrismaCrudOptions<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  serviceOptions: PrismaCrudServiceOptions<TModel, TCreate, TUpdate>,
  requestOptions: CrudRequestOptions = {},
): PrismaCrudOptions<TModel, TCreate, TUpdate> {
  return definePrismaCrudOptions({
    ...requestOptions,
    query: {
      ...normalizeQueryOptions(serviceOptions.query),
      ...normalizeQueryOptions(requestOptions.query),
    },
    routes: {
      ...normalizeRouteOptions(serviceOptions.routes),
      ...normalizeRouteOptions(requestOptions.routes),
    },
    params: {
      ...normalizeParamsOptions(serviceOptions.params),
      ...normalizeParamsOptions(requestOptions.params),
    },
    model: serviceOptions.model,
    cache: serviceOptions.cache,
  });
}

export function getPrismaCrudParams(parsed: ParsedRequestParams): Record<string, unknown> {
  return (parsed.paramsFilter || []).reduce<Record<string, unknown>>((params, filter) => {
    params[filter.field] = filter.value;
    return params;
  }, {});
}

export function getPrismaCrudPrimaryParams<TModel = unknown>(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig<TModel>,
): Record<string, unknown> {
  const params = getPrismaCrudParams(parsed);

  return model.primaryKeys.reduce<Record<string, unknown>>((primaryParams, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      primaryParams[key] = params[key];
    }

    return primaryParams;
  }, {});
}

export function hasPrismaCrudPrimaryParams<TModel = unknown>(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig<TModel>,
): boolean {
  return Object.keys(getPrismaCrudPrimaryParams(parsed, model)).length === model.primaryKeys.length;
}

export function hasOnlyPrismaCrudPrimaryParams<TModel = unknown>(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig<TModel>,
): boolean {
  const params = getPrismaCrudParams(parsed);
  const keys = Object.keys(params);

  return keys.length === model.primaryKeys.length && keys.every((key) => model.primaryKeys.includes(key));
}

export function buildPrismaCrudCountArgs(where?: PrismaCrudWhere): PrismaCrudCountArgs | undefined {
  return where ? { where } : undefined;
}
