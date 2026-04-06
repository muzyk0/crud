import { JoinOption, JoinOptions } from '@nestjsx/crud';
import { QueryJoin } from '@nestjsx/crud-request';

import { PrismaCrudModelConfig, PrismaCrudRelationConfig } from './interfaces/prisma-crud-model-config.interface';
import {
  buildPrimaryKeyRelationSelect,
  buildPrismaScalarSelect,
  ensurePrismaRelationSelection,
  mergePrismaSelect,
  PrismaCrudRelationSelection,
  PrismaCrudSelect,
} from './prisma-select.helper';

export interface PrismaCrudResolvedRelationPath {
  path: string;
  pathSegments: string[];
  relationChain: PrismaCrudRelationConfig[];
  relation: PrismaCrudRelationConfig;
}

export interface PrismaCrudResolvedField {
  field: string;
  relationPath: string[];
  relationChain: PrismaCrudRelationConfig[];
  relation?: PrismaCrudRelationConfig;
}

export interface PrismaCrudActiveJoin extends PrismaCrudResolvedRelationPath {
  join: QueryJoin;
  options: JoinOption;
  selected: boolean;
}

export interface PrismaCrudIncludePlan {
  select: PrismaCrudSelect;
  activeJoins: PrismaCrudActiveJoin[];
  aliases: Record<string, string>;
  relationNodes: Map<string, PrismaCrudRelationSelection>;
}

function toJoinMap(joins: QueryJoin[] = []): Map<string, QueryJoin> {
  return joins.reduce((map, join) => {
    map.set(join.field, join);
    return map;
  }, new Map<string, QueryJoin>());
}

function normalizeJoin(join?: QueryJoin, field?: string): QueryJoin {
  return join || { field };
}

export function resolvePrismaRelationPath(
  model: PrismaCrudModelConfig,
  path: string,
): PrismaCrudResolvedRelationPath | null {
  const pathSegments = path.split('.').filter(Boolean);

  if (!pathSegments.length) {
    return null;
  }

  const relationChain: PrismaCrudRelationConfig[] = [];
  let relationMap = model.relationMap || {};

  for (const segment of pathSegments) {
    const relation = relationMap[segment];

    if (!relation) {
      return null;
    }

    relationChain.push(relation);
    relationMap = relation.relationMap || {};
  }

  return {
    path,
    pathSegments,
    relationChain,
    relation: relationChain[relationChain.length - 1],
  };
}

function normalizeFieldAlias(field: string, aliases: Record<string, string>): string {
  const segments = field.split('.');
  const aliasPath = aliases[segments[0]];

  if (!aliasPath || aliasPath === segments[0]) {
    return field;
  }

  return [...aliasPath.split('.'), ...segments.slice(1)].join('.');
}

export function resolvePrismaField(
  model: PrismaCrudModelConfig,
  field: string,
  aliases: Record<string, string> = {},
): PrismaCrudResolvedField {
  const normalizedField = normalizeFieldAlias(field, aliases);
  const segments = normalizedField.split('.').filter(Boolean);

  if (!segments.length) {
    throw new Error(`crud-prisma: field "${field}" is empty`);
  }

  if (segments.length === 1) {
    if (!model.scalarFields.includes(segments[0])) {
      throw new Error(`crud-prisma: unknown field "${field}"`);
    }

    return {
      field: segments[0],
      relationPath: [],
      relationChain: [],
    };
  }

  const relationPath = segments.slice(0, segments.length - 1);
  const resolvedPath = resolvePrismaRelationPath(model, relationPath.join('.'));

  if (!resolvedPath) {
    throw new Error(`crud-prisma: unknown relation path "${field}"`);
  }

  const targetField = segments[segments.length - 1];

  if (!resolvedPath.relation.scalarFields.includes(targetField)) {
    throw new Error(`crud-prisma: unknown field "${field}"`);
  }

  return {
    field: targetField,
    relationPath: resolvedPath.pathSegments,
    relationChain: resolvedPath.relationChain,
    relation: resolvedPath.relation,
  };
}

export function buildPrismaIncludePlan(
  model: PrismaCrudModelConfig,
  parsedJoins: QueryJoin[] = [],
  joinOptions: JoinOptions = {},
): PrismaCrudIncludePlan {
  const requestedJoinMap = toJoinMap(parsedJoins);
  const orderedJoinPaths = Object.keys(joinOptions).sort((left, right) => left.split('.').length - right.split('.').length);
  const activeJoins: PrismaCrudActiveJoin[] = [];
  const eagerJoinPaths = new Set<string>();

  orderedJoinPaths.forEach((path) => {
    if (!joinOptions[path] || !joinOptions[path].eager) {
      return;
    }

    const resolvedPath = resolvePrismaRelationPath(model, path);

    if (!resolvedPath) {
      return;
    }

    eagerJoinPaths.add(path);
    activeJoins.push({
      ...resolvedPath,
      join: normalizeJoin(requestedJoinMap.get(path), path),
      options: joinOptions[path],
      selected: joinOptions[path].select !== false,
    });
  });

  parsedJoins.forEach((join) => {
    const options = joinOptions[join.field];

    if (!options || eagerJoinPaths.has(join.field)) {
      return;
    }

    const resolvedPath = resolvePrismaRelationPath(model, join.field);

    if (!resolvedPath) {
      return;
    }

    activeJoins.push({
      ...resolvedPath,
      join,
      options,
      selected: options.select !== false,
    });
  });

  activeJoins.sort((left, right) => left.pathSegments.length - right.pathSegments.length);

  const select: PrismaCrudSelect = {};
  const relationNodes = new Map<string, PrismaCrudRelationSelection>();
  const aliases: Record<string, string> = {};
  const selectedJoinPaths = new Set(activeJoins.filter((join) => join.selected).map((join) => join.path));

  activeJoins.forEach((activeJoin) => {
    const { path, pathSegments, relationChain, relation, options, join } = activeJoin;
    const hasSelectedDescendant = activeJoins.some(
      (candidate) => candidate.path !== path && candidate.selected && candidate.path.startsWith(`${path}.`),
    );
    const shouldMaterialize = activeJoin.selected || hasSelectedDescendant;

    if (options.alias) {
      aliases[options.alias] = path;
    }

    if (relation.alias) {
      aliases[relation.alias] = path;
    }

    const shortAlias = pathSegments[pathSegments.length - 1];

    if (!aliases[shortAlias]) {
      aliases[shortAlias] = path;
    }

    if (!shouldMaterialize) {
      return;
    }

    let currentSelect = select;

    pathSegments.forEach((segment, index) => {
      const currentPath = pathSegments.slice(0, index + 1).join('.');
      const currentRelation = relationChain[index];
      const relationSelection = ensurePrismaRelationSelection(currentSelect, segment);

      relationNodes.set(currentPath, relationSelection);

      if (index < pathSegments.length - 1 || !activeJoin.selected) {
        mergePrismaSelect(relationSelection.select, buildPrimaryKeyRelationSelect(currentRelation));
      }

      currentSelect = relationSelection.select;
    });

    const leafSelection = relationNodes.get(path);

    if (!leafSelection) {
      return;
    }

    mergePrismaSelect(
      leafSelection.select,
      buildPrismaScalarSelect(join.select, relation.scalarFields, relation.primaryKeys, options),
    );

    if (selectedJoinPaths.has(path)) {
      mergePrismaSelect(leafSelection.select, buildPrimaryKeyRelationSelect(relation));
    }
  });

  return {
    select,
    activeJoins,
    aliases,
    relationNodes,
  };
}
