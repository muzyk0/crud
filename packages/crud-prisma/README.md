# @nestjsx/crud-prisma

`@nestjsx/crud-prisma` keeps `@nestjsx/crud` controllers and `@nestjsx/crud-request` parsing in place while replacing only the ORM service layer with Prisma.

The adapter is intentionally explicit. Prisma does not expose TypeORM-style runtime metadata, so every service must describe its scalar fields, relations, unique lookup shape, and optional soft-delete/write behavior through model config.

## Install

```shell
npm i @nestjsx/crud-prisma @prisma/client prisma
```

## First-version compatibility

Goals:

- Keep @nestjsx/crud controllers and request parsing in place while replacing only the ORM service layer.
- Map CrudRequest.parsed and CrudOptions.query into explicit Prisma args through model metadata instead of reflection.

Supported:

- Scalar field selection through scalarFields.
- Relation traversal through relationMap, including nested relation metadata.
- Compound primary keys and soft delete through explicit model configuration.
- Write normalization through optional create, update, replace, delete, and recover hooks.

Known non-goals:

- TypeORM runtime metadata parity or inferred relation discovery.
- Implicit nested writes or cascade behavior.
- Transparent query-cache parity without an explicit extension hook.

Notes:

- Request-level cache settings are a no-op by default and only become active when PrismaCrudOptions.cache is provided.
- When PrismaCrudOptions.cache is enabled, expose `get(key)` and/or `set(key, value, ttl)` so the adapter can wrap normalized Prisma args with request-scoped cache reads and writes.
- Join aliases remain compatibility metadata only and do not drive Prisma query generation.
- Soft delete behavior must be declared through softDelete config rather than ORM-specific decorators.

## Required model metadata

Every `PrismaCrudService` receives a Prisma delegate plus explicit model config:

- `modelName`: the resource name used in errors and docs.
- `scalarFields`: every scalar field that can participate in `select`, `where`, sorting, or write normalization.
- `primaryKeys`: one or more fields used to detect direct lookups and refetch mutation results.
- `whereUnique(params, entity)`: builds Prisma `where` input for `findUnique`, `update`, `delete`, and recover flows.
- `relationMap`: optional relation metadata for `join`, nested `join`, required joins, and relation sorting.
- `softDelete`: optional field/value mapping used by `deleteOne()` and `recoverOne()`.
- `write`: optional `normalizeCreate`, `normalizeUpdate`, `normalizeReplace`, `normalizeDelete`, and `normalizeRecover` hooks for explicit write shaping.

## Usage

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaCrudService, definePrismaCrudModelConfig } from '@nestjsx/crud-prisma';

import { PrismaService } from '../prisma/prisma.service';
import { Company } from './company.model';

const companyModel = definePrismaCrudModelConfig<Company>({
  modelName: 'Company',
  scalarFields: ['id', 'name', 'domain', 'description', 'deletedAt'],
  primaryKeys: ['id'],
  softDelete: {
    field: 'deletedAt',
    deletedValue: () => new Date(),
    notDeletedValue: null,
  },
  whereUnique: (params, entity) => ({
    id: Number(entity && entity.id ? entity.id : params.id),
  }),
});

@Injectable()
export class CompaniesService extends PrismaCrudService<Company> {
  constructor(prisma: PrismaService) {
    super(prisma.company, {
      model: companyModel,
      query: {
        softDelete: true,
      },
      routes: {
        deleteOneBase: {
          returnDeleted: false,
        },
      },
    });
  }
}
```

Your controller can stay on `@Crud()`:

```typescript
import { Controller } from '@nestjs/common';
import { Crud } from '@nestjsx/crud';

import { Company } from './company.model';
import { CompaniesService } from './companies.service';

@Crud({
  model: {
    type: Company,
  },
  query: {
    softDelete: true,
  },
})
@Controller('companies')
export class CompaniesController {
  constructor(public service: CompaniesService) {}
}
```

## Relations, compound keys, and write hooks

```typescript
import { definePrismaCrudModelConfig } from '@nestjsx/crud-prisma';

import { User } from './user.model';

export const userModel = definePrismaCrudModelConfig<User>({
  modelName: 'User',
  scalarFields: ['id', 'email', 'isActive', 'companyId', 'profileId', 'nameFirst', 'nameLast', 'deletedAt'],
  primaryKeys: ['id'],
  relationMap: {
    company: {
      type: 'one',
      scalarFields: ['id', 'name', 'domain', 'description', 'deletedAt'],
      primaryKeys: ['id'],
      relationMap: {
        projects: {
          type: 'many',
          scalarFields: ['id', 'name', 'description', 'isActive', 'companyId'],
          primaryKeys: ['id'],
        },
      },
    },
    profile: {
      type: 'one',
      scalarFields: ['id', 'name', 'deletedAt'],
      primaryKeys: ['id'],
    },
  },
  softDelete: {
    field: 'deletedAt',
    deletedValue: () => new Date(),
    notDeletedValue: null,
  },
  whereUnique: (params, entity) => ({
    id: Number(entity && entity.id ? entity.id : params.id),
  }),
  write: {
    normalizeCreate: ({ dto }) => ({
      ...dto,
      profile: {
        create: {
          nickname: 'created-via-hook',
        },
      },
    }),
    normalizeUpdate: ({ dto }) => dto,
  },
});
```

Use `relationMap` for `join`, nested `join`, eager relations, required joins, and nested sorting. Use `whereUnique` for single-key and compound-key lookups. Use `write` hooks only when Prisma needs explicit nested write normalization; they are the supported replacement for inferred TypeORM cascades.

## Route response flags

`PrismaCrudService` honors the route-level response flags from `@nestjsx/crud`:

- `routes.createOneBase.returnShallow`
- `routes.updateOneBase.returnShallow`
- `routes.replaceOneBase.returnShallow`
- `routes.deleteOneBase.returnDeleted`
- `routes.recoverOneBase.returnRecovered`

When these flags are unset, the service refetches the entity inside the current request scope when it can resolve a primary-key lookup.

## Migration from @nestjsx/crud-typeorm

1. Keep the existing `@Crud()` controller and `CrudAuth()` configuration.
2. Replace `TypeOrmCrudService<Entity>` with `PrismaCrudService<Model>`.
3. Move entity metadata into `definePrismaCrudModelConfig()` by listing scalar fields, relations, primary keys, and `whereUnique`.
4. Keep soft delete explicit with `query.softDelete` plus `model.softDelete`.
5. Add `write.normalize*` hooks anywhere the TypeORM service previously relied on implicit nested writes or cascade behavior.

This keeps controller routes stable while making the Prisma service contract explicit and testable one resource at a time.

## Verified examples from the integration fixtures

- `GET /companies?include_deleted=1` returns soft-deleted rows only when `include_deleted` is present.
- `GET /users/1?join=company&join=company.projects` loads nested relations and respects `exclude` rules declared in `query.join`.
- `POST /companies/:companyId/users` preserves the route param filter on writes even if the payload tries to override `companyId`.
- `PATCH /me` respects `CrudAuth.persist()` so auth-owned fields such as `email` are kept authoritative.
- `POST /projects` uses `CrudAuth.persist()` and `CrudAuth.filter()` to force the authenticated `companyId`.

Those routes are covered by `packages/crud-prisma/test/prisma-crud.integration.spec.ts`, `prisma-crud.write.spec.ts`, and `prisma-crud-auth.spec.ts`.
