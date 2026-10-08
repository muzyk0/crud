import { QueryOptions } from '@nestjsx/crud';
import { ComparisonOperator, ParsedRequestParams, QueryFilter, SCondition } from '@nestjsx/crud-request';

import { PrismaCrudModelConfig } from './interfaces/prisma-crud-model-config.interface';
import { PrismaCrudActiveJoin, resolvePrismaField } from './prisma-include.helper';

export interface PrismaCrudWhere {
  [field: string]: unknown;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(value?: PrismaCrudWhere): boolean {
  return !!value && Object.keys(value).length > 0;
}

function combineWhere(operator: 'AND' | 'OR', fragments: PrismaCrudWhere[]): PrismaCrudWhere | undefined {
  const filtered = fragments.filter((fragment) => hasKeys(fragment));

  if (!filtered.length) {
    return undefined;
  }

  if (filtered.length === 1) {
    return filtered[0];
  }

  return { [operator]: filtered };
}

function normalizeOperator(operator: ComparisonOperator): ComparisonOperator {
  return operator[0] === '$' ? operator : (`$${operator}` as ComparisonOperator);
}

function wrapFieldCondition(
  relationPath: string[],
  relationTypes: Array<'one' | 'many'>,
  field: string,
  value: unknown,
): PrismaCrudWhere {
  let fragment: PrismaCrudWhere = { [field]: value };

  for (let i = relationPath.length - 1; i >= 0; i -= 1) {
    const relation = relationPath[i];
    const relationType = relationTypes[i];

    fragment =
      relationType === 'many'
        ? { [relation]: { some: fragment } }
        : {
            [relation]: {
              is: fragment,
            },
          };
  }

  return fragment;
}

function coerceStringFilterValue(value: unknown): unknown {
  if (typeof value === 'undefined' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceStringFilterValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return `${value}`;
}

function createScalarFilter(operator: ComparisonOperator, value: any, stringField = false): unknown {
  const normalizedOperator = normalizeOperator(operator);
  const normalizedValue =
    stringField && normalizedOperator !== '$isnull' && normalizedOperator !== '$notnull' ? coerceStringFilterValue(value) : value;

  switch (normalizedOperator) {
    case '$eq':
      return { equals: normalizedValue };
    case '$ne':
      return { not: normalizedValue };
    case '$gt':
      return { gt: normalizedValue };
    case '$lt':
      return { lt: normalizedValue };
    case '$gte':
      return { gte: normalizedValue };
    case '$lte':
      return { lte: normalizedValue };
    case '$starts':
      return { startsWith: normalizedValue };
    case '$ends':
      return { endsWith: normalizedValue };
    case '$cont':
      return { contains: normalizedValue };
    case '$excl':
      return { not: { contains: normalizedValue } };
    case '$in':
      if (!Array.isArray(normalizedValue)) {
        throw new Error('crud-prisma: $in expects an array value');
      }

      return { in: normalizedValue };
    case '$notin':
      if (!Array.isArray(normalizedValue)) {
        throw new Error('crud-prisma: $notin expects an array value');
      }

      return { notIn: normalizedValue };
    case '$isnull':
      return { equals: null };
    case '$notnull':
      return { not: null };
    case '$between':
      if (!Array.isArray(normalizedValue) || normalizedValue.length !== 2) {
        throw new Error('crud-prisma: $between expects exactly two values');
      }

      return { gte: normalizedValue[0], lte: normalizedValue[1] };
    case '$eqL':
      return { equals: normalizedValue, mode: 'insensitive' };
    case '$neL':
      return { not: { equals: normalizedValue, mode: 'insensitive' } };
    case '$startsL':
      return { startsWith: normalizedValue, mode: 'insensitive' };
    case '$endsL':
      return { endsWith: normalizedValue, mode: 'insensitive' };
    case '$contL':
      return { contains: normalizedValue, mode: 'insensitive' };
    case '$exclL':
      return { not: { contains: normalizedValue, mode: 'insensitive' } };
    case '$inL':
      if (!Array.isArray(normalizedValue)) {
        throw new Error('crud-prisma: $inL expects an array value');
      }

      return { in: normalizedValue, mode: 'insensitive' };
    case '$notinL':
      if (!Array.isArray(normalizedValue)) {
        throw new Error('crud-prisma: $notinL expects an array value');
      }

      return { notIn: normalizedValue, mode: 'insensitive' };
    default:
      return { equals: normalizedValue };
  }
}

function mapFieldSearch(
  model: PrismaCrudModelConfig,
  field: string,
  value: any,
  aliases: Record<string, string>,
): PrismaCrudWhere | undefined {
  const resolvedField = resolvePrismaField(model, field, aliases);
  const relationTypes = resolvedField.relationChain.map((relation) => relation.type);

  if (!isObject(value)) {
    const operator = value === null ? '$isnull' : '$eq';
    return wrapFieldCondition(
      relationPathOrEmpty(resolvedField),
      relationTypes,
      resolvedField.field,
      createScalarFilter(operator, value, resolvedField.stringField),
    );
  }

  const fragments = Object.entries(value).reduce<PrismaCrudWhere[]>((acc, [operator, operatorValue]) => {
    if (operator === '$or') {
      if (!isObject(operatorValue)) {
        return acc;
      }

      const orFragments = Object.entries(operatorValue)
        .map(([orOperator, orValue]) =>
          wrapFieldCondition(
            relationPathOrEmpty(resolvedField),
            relationTypes,
            resolvedField.field,
            createScalarFilter(orOperator as ComparisonOperator, orValue, resolvedField.stringField),
          ),
        )
        .filter((fragment) => hasKeys(fragment));
      const orCondition = combineWhere('OR', orFragments);

      if (orCondition) {
        acc.push(orCondition);
      }

      return acc;
    }

    acc.push(
      wrapFieldCondition(
        relationPathOrEmpty(resolvedField),
        relationTypes,
        resolvedField.field,
        createScalarFilter(operator as ComparisonOperator, operatorValue, resolvedField.stringField),
      ),
    );

    return acc;
  }, []);

  return combineWhere('AND', fragments);
}

function relationPathOrEmpty(resolvedField: ReturnType<typeof resolvePrismaField>): string[] {
  return resolvedField.relationPath || [];
}

function mapSearchCondition(
  model: PrismaCrudModelConfig,
  search: SCondition,
  aliases: Record<string, string>,
): PrismaCrudWhere | undefined {
  if (!isObject(search)) {
    return undefined;
  }

  const keys = Object.keys(search);

  if (!keys.length) {
    return undefined;
  }

  if (Array.isArray(search.$and)) {
    return combineWhere(
      'AND',
      search.$and
        .map((condition) => mapSearchCondition(model, condition, aliases))
        .filter((condition): condition is PrismaCrudWhere => hasKeys(condition)),
    );
  }

  if (Array.isArray(search.$or)) {
    const orCondition = combineWhere(
      'OR',
      search.$or
        .map((condition) => mapSearchCondition(model, condition, aliases))
        .filter((condition): condition is PrismaCrudWhere => hasKeys(condition)),
    );

    if (keys.length === 1) {
      return orCondition;
    }

    const andFragments = keys
      .filter((field) => field !== '$or')
      .map((field) => mapFieldSearch(model, field, search[field], aliases))
      .filter((condition): condition is PrismaCrudWhere => hasKeys(condition));

    if (orCondition) {
      andFragments.push(orCondition);
    }

    return combineWhere('AND', andFragments);
  }

  return combineWhere(
    'AND',
    keys
      .map((field) => mapFieldSearch(model, field, search[field], aliases))
      .filter((condition): condition is PrismaCrudWhere => hasKeys(condition)),
  );
}

function convertFilterToSearch(filter: QueryFilter): SCondition {
  const operator = normalizeOperator(filter.operator);
  const value = operator === '$isnull' || operator === '$notnull' ? true : filter.value;

  return {
    [filter.field]: {
      [operator]: value,
    },
  };
}

function buildLegacySearch(parsed: ParsedRequestParams, query: QueryOptions = {}, many = true): SCondition | undefined {
  if (parsed.search) {
    return parsed.search;
  }

  const paramsSearch = (parsed.paramsFilter || []).map(convertFilterToSearch);

  if (typeof query.filter === 'function') {
    const functionFilter = query.filter(parsed.search, many);
    const conditions = [...paramsSearch, ...(functionFilter ? [functionFilter] : [])];

    if (!conditions.length) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : { $and: conditions };
  }

  const optionFilters = Array.isArray(query.filter)
    ? query.filter.map(convertFilterToSearch)
    : query.filter
    ? [query.filter]
    : [];
  let requestSearch: SCondition[] = [];

  if (parsed.filter && parsed.filter.length && parsed.or && parsed.or.length) {
    requestSearch =
      parsed.filter.length === 1 && parsed.or.length === 1
        ? [
            {
              $or: [convertFilterToSearch(parsed.filter[0]), convertFilterToSearch(parsed.or[0])],
            },
          ]
        : [
            {
              $or: [
                { $and: parsed.filter.map(convertFilterToSearch) },
                { $and: parsed.or.map(convertFilterToSearch) },
              ],
            },
          ];
  } else if (parsed.filter && parsed.filter.length) {
    requestSearch = parsed.filter.map(convertFilterToSearch);
  } else if (parsed.or && parsed.or.length) {
    requestSearch =
      parsed.or.length === 1
        ? [convertFilterToSearch(parsed.or[0])]
        : [
            {
              $or: parsed.or.map(convertFilterToSearch),
            },
          ];
  }

  const conditions = [...paramsSearch, ...optionFilters, ...requestSearch].filter((condition) => isObject(condition));

  if (!conditions.length) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

function buildRequiredJoinWhere(activeJoin: PrismaCrudActiveJoin): PrismaCrudWhere {
  const { pathSegments, relationChain } = activeJoin;
  const lastIndex = pathSegments.length - 1;
  const lastRelation = relationChain[lastIndex];
  let fragment: PrismaCrudWhere =
    lastRelation.type === 'many'
      ? { [pathSegments[lastIndex]]: { some: {} } }
      : { [pathSegments[lastIndex]]: { isNot: null } };

  for (let i = lastIndex - 1; i >= 0; i -= 1) {
    fragment =
      relationChain[i].type === 'many'
        ? {
            [pathSegments[i]]: {
              some: fragment,
            },
          }
        : {
            [pathSegments[i]]: {
              is: fragment,
            },
          };
  }

  return fragment;
}

function buildSoftDeleteWhere(model: PrismaCrudModelConfig, parsed: ParsedRequestParams, query: QueryOptions = {}): PrismaCrudWhere {
  if (!query.softDelete || !model.softDelete || parsed.includeDeleted === 1) {
    return {};
  }

  return {
    [model.softDelete.field]: model.softDelete.notDeletedValue,
  };
}

export function buildPrismaWhere(
  parsed: ParsedRequestParams,
  model: PrismaCrudModelConfig,
  query: QueryOptions = {},
  aliases: Record<string, string> = {},
  requiredJoins: PrismaCrudActiveJoin[] = [],
  many = true,
): PrismaCrudWhere | undefined {
  const search = buildLegacySearch(parsed, query, many);
  const fragments: PrismaCrudWhere[] = [];
  const searchCondition = search ? mapSearchCondition(model, search, aliases) : undefined;

  if (searchCondition) {
    fragments.push(searchCondition);
  }

  requiredJoins.forEach((join) => {
    fragments.push(buildRequiredJoinWhere(join));
  });

  const softDeleteCondition = buildSoftDeleteWhere(model, parsed, query);

  if (hasKeys(softDeleteCondition)) {
    fragments.push(softDeleteCondition);
  }

  return combineWhere('AND', fragments);
}
