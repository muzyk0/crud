import { QueryFields } from '@nestjsx/crud-request';

import { PrismaCrudRelationConfig } from './interfaces/prisma-crud-model-config.interface';

interface PrismaCrudFieldSelectionOptions {
  allow?: QueryFields;
  exclude?: QueryFields;
  persist?: QueryFields;
}

export type PrismaCrudSortDirection = 'asc' | 'desc';

export interface PrismaCrudOrderBy {
  [field: string]: PrismaCrudSortDirection | PrismaCrudOrderBy;
}

export interface PrismaCrudRelationSelection {
  select: PrismaCrudSelect;
  orderBy?: PrismaCrudOrderBy[];
}

export interface PrismaCrudSelect {
  [field: string]: true | PrismaCrudRelationSelection;
}

function isRelationSelection(value: PrismaCrudSelect[string]): value is PrismaCrudRelationSelection {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'select');
}

function filterKnownFields(fields: QueryFields = [], scalarFields: string[]): string[] {
  return fields.filter((field) => scalarFields.includes(field));
}

export function getAllowedPrismaFields(
  scalarFields: string[],
  options: PrismaCrudFieldSelectionOptions = {},
): string[] {
  return scalarFields.filter((field) => {
    if (Array.isArray(options.exclude) && options.exclude.length && options.exclude.includes(field)) {
      return false;
    }

    if (Array.isArray(options.allow) && options.allow.length) {
      return options.allow.includes(field);
    }

    return true;
  });
}

export function buildPrismaScalarSelect(
  requestedFields: QueryFields,
  scalarFields: string[],
  primaryKeys: string[] = [],
  options: PrismaCrudFieldSelectionOptions = {},
  primaryOnly = false,
): PrismaCrudSelect {
  const allowedFields = getAllowedPrismaFields(scalarFields, options);
  const selectedFields = primaryOnly
    ? []
    : requestedFields && requestedFields.length
    ? requestedFields.filter((field) => allowedFields.includes(field))
    : allowedFields;
  const persistedFields = filterKnownFields(options.persist, scalarFields);
  const keys = filterKnownFields(primaryKeys, scalarFields);
  const select: PrismaCrudSelect = {};

  [...new Set([...keys, ...persistedFields, ...selectedFields])].forEach((field) => {
    select[field] = true;
  });

  return select;
}

export function buildPrimaryKeyRelationSelect(relation: PrismaCrudRelationConfig): PrismaCrudSelect {
  return buildPrismaScalarSelect([], relation.scalarFields, relation.primaryKeys, {}, true);
}

export function ensurePrismaRelationSelection(select: PrismaCrudSelect, relationName: string): PrismaCrudRelationSelection {
  const current = select[relationName];

  if (isRelationSelection(current)) {
    return current;
  }

  const relationSelection: PrismaCrudRelationSelection = { select: {} };
  select[relationName] = relationSelection;

  return relationSelection;
}

export function mergePrismaSelect(target: PrismaCrudSelect, source: PrismaCrudSelect): PrismaCrudSelect {
  Object.entries(source).forEach(([field, value]) => {
    const current = target[field];

    if (value === true) {
      target[field] = true;
      return;
    }

    const targetRelation = isRelationSelection(current) ? current : ensurePrismaRelationSelection(target, field);
    mergePrismaSelect(targetRelation.select, value.select);

    if (value.orderBy && value.orderBy.length) {
      targetRelation.orderBy = [...(targetRelation.orderBy || []), ...value.orderBy];
    }
  });

  return target;
}
