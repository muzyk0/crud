import { ParsedRequestParams, QuerySort } from '@nestjsx/crud-request';

import {
  definePrismaCrudOptions,
  PRISMA_CRUD_COMPATIBILITY,
  PrismaCrudCacheExtension,
  PrismaCrudOptions,
} from './interfaces/prisma-crud-options.interface';
import { buildPrismaIncludePlan, resolvePrismaField } from './prisma-include.helper';
import {
  getPrismaRelationSelection,
  PrismaCrudOrderBy,
  PrismaCrudRelationSelection,
  PrismaCrudSelect,
  buildPrismaScalarSelect,
  mergePrismaSelect,
} from './prisma-select.helper';
import { buildPrismaWhere, PrismaCrudWhere } from './prisma-where.helper';

export interface PrismaCrudQueryArgs {
  select: PrismaCrudSelect;
  where?: PrismaCrudWhere;
  orderBy?: PrismaCrudOrderBy[];
  take?: number;
  skip?: number;
}

export interface PrismaCrudCachePlan {
  enabled: boolean;
  noop: boolean;
  ttl?: number;
  key?: string;
  extension?: PrismaCrudCacheExtension;
  note: string;
}

export interface PrismaCrudQueryMapResult {
  args: PrismaCrudQueryArgs;
  cache: PrismaCrudCachePlan;
}

function getTake(limit: number, queryLimit?: number, maxLimit?: number): number | undefined {
  if (limit) {
    return maxLimit ? (limit <= maxLimit ? limit : maxLimit) : limit;
  }

  if (queryLimit) {
    return maxLimit ? (queryLimit <= maxLimit ? queryLimit : maxLimit) : queryLimit;
  }

  return maxLimit || undefined;
}

function getSkip(page: number, offset: number, take?: number): number | undefined {
  if (page && take) {
    return take * (page - 1);
  }

  return offset || undefined;
}

function buildNestedOrderBy(relationPath: string[], field: string, direction: QuerySort['order']): PrismaCrudOrderBy {
  let orderBy: PrismaCrudOrderBy | 'asc' | 'desc' = { [field]: direction.toLowerCase() as 'asc' | 'desc' };

  for (let i = relationPath.length - 1; i >= 0; i -= 1) {
    orderBy = { [relationPath[i]]: orderBy };
  }

  return orderBy as PrismaCrudOrderBy;
}

function getNestedRelationSelection(
  select: PrismaCrudSelect,
  relationPath: string[],
): PrismaCrudRelationSelection | undefined {
  if (!relationPath.length) {
    return undefined;
  }

  let currentSelect = select;
  let currentRelationSelection: PrismaCrudRelationSelection | undefined;

  for (const relation of relationPath) {
    currentRelationSelection = getPrismaRelationSelection(currentSelect, relation);

    if (!currentRelationSelection) {
      return undefined;
    }

    currentSelect = currentRelationSelection.select;
  }

  return currentRelationSelection;
}

function applySort(
  select: PrismaCrudSelect,
  orderBy: PrismaCrudOrderBy[],
  sort: QuerySort[],
  options: PrismaCrudOptions,
  aliases: Record<string, string>,
): void {
  sort.forEach((sortField) => {
    const resolvedField = resolvePrismaField(options.model, sortField.field, aliases);
    const relationTypes = resolvedField.relationChain.map((relation) => relation.type);
    const lastRelationType = relationTypes[relationTypes.length - 1];

    if (lastRelationType === 'many') {
      const relationSelection = getNestedRelationSelection(select, resolvedField.relationPath);

      if (!relationSelection) {
        throw new Error(`crud-prisma: sort path "${sortField.field}" requires an active relation selection`);
      }

      relationSelection.orderBy = [
        ...(relationSelection.orderBy || []),
        buildNestedOrderBy([], resolvedField.field, sortField.order),
      ];
      return;
    }

    orderBy.push(buildNestedOrderBy(resolvedField.relationPath, resolvedField.field, sortField.order));
  });
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function buildCachePlan(
  options: PrismaCrudOptions,
  args: PrismaCrudQueryArgs,
  parsedCache?: number,
): PrismaCrudCachePlan {
  if (!options.query || !options.query.cache || parsedCache === 0) {
    return {
      enabled: false,
      noop: false,
      note: 'Query cache not requested for this Prisma mapping.',
    };
  }

  if (!options.cache) {
    return {
      enabled: false,
      noop: true,
      ttl: options.query.cache,
      note: PRISMA_CRUD_COMPATIBILITY.notes.cache,
    };
  }

  return {
    enabled: true,
    noop: false,
    ttl: options.query.cache,
    key: JSON.stringify(sortObject({ model: options.model.modelName, args })),
    extension: options.cache,
    note: 'Use PrismaCrudOptions.cache to apply request-scoped caching around the mapped Prisma args.',
  };
}

export function mapCrudRequestToPrisma(
  parsed: ParsedRequestParams,
  options: PrismaCrudOptions,
  many = true,
): PrismaCrudQueryMapResult {
  const normalizedOptions = definePrismaCrudOptions(options);
  const query = normalizedOptions.query || {};
  const includePlan = buildPrismaIncludePlan(normalizedOptions.model, parsed.join, query.join);
  const select = buildPrismaScalarSelect(
    parsed.fields,
    normalizedOptions.model.scalarFields,
    normalizedOptions.model.primaryKeys,
    query,
  );

  mergePrismaSelect(select, includePlan.select);

  const requiredJoins = includePlan.activeJoins.filter((join) => join.options.required);
  const args: PrismaCrudQueryArgs = {
    select,
  };
  const where = buildPrismaWhere(parsed, normalizedOptions.model, query, includePlan.aliases, requiredJoins, many);

  if (where) {
    args.where = where;
  }

  if (many) {
    const orderBy: PrismaCrudOrderBy[] = [];
    const sort = parsed.sort && parsed.sort.length ? parsed.sort : query.sort || [];

    if (sort.length) {
      applySort(select, orderBy, sort, normalizedOptions, includePlan.aliases);
    }

    if (orderBy.length) {
      args.orderBy = orderBy;
    }

    const take = getTake(parsed.limit, query.limit, query.maxLimit);
    const skip = getSkip(parsed.page, parsed.offset, take);

    if (typeof take !== 'undefined') {
      args.take = take;
    }

    if (typeof skip !== 'undefined') {
      args.skip = skip;
    }
  }

  return {
    args,
    cache: buildCachePlan(normalizedOptions, args, parsed.cache),
  };
}
