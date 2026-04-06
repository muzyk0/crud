import { CrudRequest } from '@nestjsx/crud';
import { ParsedRequestParams, QueryFilter, SCondition } from '@nestjsx/crud-request';

import { PrismaCrudModelConfig, PrismaCrudWhereUniqueInput } from './interfaces/prisma-crud-model-config.interface';
import { getPrismaCrudParams } from './prisma-crud.utils';

type PrismaCrudWriteMode = 'create' | 'update' | 'replace';

type PrismaCrudWritePayload = Record<string, unknown>;

function isObject(value: unknown): value is PrismaCrudWritePayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAuthPersist(parsed: ParsedRequestParams): PrismaCrudWritePayload {
  return isObject(parsed.authPersist) ? parsed.authPersist : {};
}

function getKnownScalarPayload<TModel = unknown>(
  model: PrismaCrudModelConfig<TModel>,
  payload?: PrismaCrudWritePayload,
): PrismaCrudWritePayload {
  if (!isObject(payload)) {
    return {};
  }

  return model.scalarFields.reduce<PrismaCrudWritePayload>((data, field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      data[field] = payload[field];
    }

    return data;
  }, {});
}

function getScalarEntityData<TModel = unknown>(
  model: PrismaCrudModelConfig<TModel>,
  entity?: TModel | null,
): PrismaCrudWritePayload {
  if (!isObject(entity)) {
    return {};
  }

  return model.scalarFields.reduce<PrismaCrudWritePayload>((data, field) => {
    if (Object.prototype.hasOwnProperty.call(entity, field)) {
      data[field] = entity[field];
    }

    return data;
  }, {});
}

function mergeWritePayload(
  mode: PrismaCrudWriteMode,
  existing: PrismaCrudWritePayload,
  payload: PrismaCrudWritePayload,
  paramsFilter: PrismaCrudWritePayload,
  authPersist: PrismaCrudWritePayload,
  allowParamsOverride = false,
): PrismaCrudWritePayload {
  switch (mode) {
    case 'create':
      return { ...payload, ...paramsFilter, ...authPersist };
    case 'replace':
      return allowParamsOverride
        ? { ...existing, ...paramsFilter, ...payload, ...authPersist }
        : { ...existing, ...payload, ...paramsFilter, ...authPersist };
    case 'update':
    default:
      return allowParamsOverride
        ? { ...existing, ...payload, ...authPersist }
        : { ...existing, ...payload, ...paramsFilter, ...authPersist };
  }
}

async function normalizeWritePayload<TModel = unknown, TPayload = Partial<TModel>>(
  mode: PrismaCrudWriteMode,
  model: PrismaCrudModelConfig<TModel, any, any>,
  dto: TPayload,
  parsed: ParsedRequestParams,
  existing?: TModel | null,
  allowParamsOverride = false,
): Promise<TPayload | undefined> {
  if (!isObject(dto)) {
    return undefined;
  }

  const existingScalarData = getScalarEntityData(model, existing);
  const paramsFilter = getPrismaCrudParams(parsed);
  const authPersist = getAuthPersist(parsed);
  const hookName =
    mode === 'create' ? 'normalizeCreate' : mode === 'replace' ? 'normalizeReplace' : 'normalizeUpdate';
  const hook = model.write && model.write[hookName];
  const initial = mergeWritePayload(
    mode,
    existingScalarData,
    getKnownScalarPayload(model, dto),
    paramsFilter,
    {},
    allowParamsOverride,
  );
  const normalized = hook
    ? await hook({
        dto: initial,
        paramsFilter,
        authPersist,
        existing: existing || null,
      })
    : initial;

  if (!isObject(normalized) || !Object.keys(normalized).length) {
    return undefined;
  }

  return mergeWritePayload(
    mode,
    existingScalarData,
    normalized,
    paramsFilter,
    authPersist,
    allowParamsOverride,
  ) as TPayload;
}

function getEntityPrimaryLookup<TModel = unknown>(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig<TModel>,
  entity?: TModel | null,
): PrismaCrudWritePayload {
  const params = getPrismaCrudParams(parsed);

  return model.primaryKeys.reduce<PrismaCrudWritePayload>((lookup, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      lookup[key] = params[key];
    } else if (isObject(entity) && Object.prototype.hasOwnProperty.call(entity, key)) {
      lookup[key] = entity[key];
    }

    return lookup;
  }, {});
}

function mergePrimaryLookupIntoParamsFilter(
  paramsFilter: QueryFilter[] = [],
  primaryLookup: PrismaCrudWritePayload,
): QueryFilter[] {
  const merged = paramsFilter.map((filter) =>
    Object.prototype.hasOwnProperty.call(primaryLookup, filter.field)
      ? {
          ...filter,
          value: primaryLookup[filter.field],
        }
      : filter,
  );
  const knownFields = new Set(merged.map((filter) => filter.field));

  Object.keys(primaryLookup).forEach((field) => {
    if (!knownFields.has(field)) {
      merged.push({
        field,
        operator: '$eq',
        value: primaryLookup[field],
      });
    }
  });

  return merged;
}

function buildPrimaryLookupSearch(primaryLookup: PrismaCrudWritePayload): SCondition {
  const conditions = Object.keys(primaryLookup).map((field) => ({
    [field]: primaryLookup[field],
  }));

  if (conditions.length === 1) {
    return conditions[0];
  }

  return {
    $and: conditions,
  };
}

async function resolveMutationWhere<TModel = unknown>(
  hookName: 'normalizeDelete' | 'normalizeRecover',
  model: PrismaCrudModelConfig<TModel, any, any>,
  parsed: ParsedRequestParams,
  existing?: TModel | null,
): Promise<PrismaCrudWhereUniqueInput> {
  const baseWhere = buildPrismaCrudMutationWhere(parsed, model, existing);
  const hook = model.write && model.write[hookName];

  if (!hook) {
    return baseWhere;
  }

  const override = await hook({
    dto: undefined,
    paramsFilter: getPrismaCrudParams(parsed),
    authPersist: getAuthPersist(parsed),
    existing: existing || null,
  });

  return isObject(override) ? override : baseWhere;
}

export function hasPrismaCrudEntityPrimaryLookup<TModel = unknown>(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig<TModel>,
  entity?: TModel | null,
): boolean {
  return Object.keys(getEntityPrimaryLookup(parsed, model, entity)).length === model.primaryKeys.length;
}

export function clonePrismaCrudRequestWithEntity<TModel = unknown>(
  req: CrudRequest,
  model: PrismaCrudModelConfig<TModel>,
  entity?: TModel | null,
): CrudRequest {
  const primaryLookup = getEntityPrimaryLookup(req.parsed, model, entity);

  if (Object.keys(primaryLookup).length !== model.primaryKeys.length) {
    return req;
  }

  return {
    ...req,
    parsed: {
      ...req.parsed,
      search: req.parsed.search
        ? {
            $and: [req.parsed.search, buildPrimaryLookupSearch(primaryLookup)],
          }
        : req.parsed.search,
      paramsFilter: mergePrimaryLookupIntoParamsFilter(req.parsed.paramsFilter, primaryLookup),
    },
  };
}

export function buildPrismaCrudMutationWhere<TModel = unknown>(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig<TModel>,
  existing?: TModel | null,
): PrismaCrudWhereUniqueInput {
  return model.whereUnique(getPrismaCrudParams(parsed), existing || null);
}

export function buildPrismaCrudSoftDeleteData<TModel = unknown>(
  model: PrismaCrudModelConfig<TModel>,
  action: 'delete' | 'recover',
): PrismaCrudWritePayload {
  if (!model.softDelete) {
    throw new Error('crud-prisma: softDelete config is required for deleteOne() and recoverOne()');
  }

  const value = action === 'delete' ? model.softDelete.deletedValue : model.softDelete.notDeletedValue;

  return {
    [model.softDelete.field]: typeof value === 'function' ? value() : value,
  };
}

export async function buildPrismaCrudCreateData<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  model: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
  dto: TCreate,
  parsed: ParsedRequestParams,
): Promise<TCreate | undefined> {
  return normalizeWritePayload('create', model, dto, parsed);
}

export async function buildPrismaCrudUpdateData<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  model: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
  existing: TModel,
  dto: TUpdate,
  parsed: ParsedRequestParams,
  allowParamsOverride = false,
): Promise<TUpdate | undefined> {
  return normalizeWritePayload('update', model, dto, parsed, existing, allowParamsOverride);
}

export async function buildPrismaCrudReplaceData<
  TModel = unknown,
  TCreate = Partial<TModel>,
  TUpdate = Partial<TModel>,
>(
  model: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
  existing: TModel | null,
  dto: TUpdate,
  parsed: ParsedRequestParams,
  allowParamsOverride = false,
): Promise<TUpdate | undefined> {
  return normalizeWritePayload('replace', model, dto, parsed, existing, allowParamsOverride);
}

export async function buildPrismaCrudDeleteWhere<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  model: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
  parsed: ParsedRequestParams,
  existing: TModel,
): Promise<PrismaCrudWhereUniqueInput> {
  return resolveMutationWhere('normalizeDelete', model, parsed, existing);
}

export async function buildPrismaCrudRecoverWhere<TModel = unknown, TCreate = Partial<TModel>, TUpdate = Partial<TModel>>(
  model: PrismaCrudModelConfig<TModel, TCreate, TUpdate>,
  parsed: ParsedRequestParams,
  existing: TModel,
): Promise<PrismaCrudWhereUniqueInput> {
  return resolveMutationWhere('normalizeRecover', model, parsed, existing);
}
