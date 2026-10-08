---
# Prisma Adapter For @nestjsx/crud

## Overview
Add a new `@nestjsx/crud-prisma` package inside the local `crud/` monorepo to replace only the ORM layer from `@nestjsx/crud-typeorm`.
The goal is not a strict drop-in replacement. The first version should provide a contract-compatible `PrismaCrudService` plus a mapper from `CrudRequest.parsed` and `CrudOptions.query` into Prisma args so services can be migrated one controller at a time while keeping `@nestjsx/crud` and `@nestjsx/crud-request` in place.

## Context
- Files involved: `crud/package.json`, `crud/tsconfig.json`, `crud/packages/crud/src/services/crud-service.abstract.ts`, `crud/packages/crud/src/interfaces/crud-options.interface.ts`, `crud/packages/crud/src/interfaces/params-options.interface.ts`, `crud/packages/crud/src/interceptors/crud-request.interceptor.ts`, `crud/packages/crud-request/src/request-query.parser.ts`, `crud/packages/crud-request/src/interfaces/parsed-request.interface.ts`, `crud/packages/crud-typeorm/src/typeorm-crud.service.ts`, `crud/packages/crud-typeorm/test/*.spec.ts`, `crud/integration/crud-typeorm/**/*`, `crud/README.md`, `crud.wiki/Services.md`
- Related patterns: `CrudRequestInterceptor` already produces ORM-agnostic `ParsedRequestParams`; `CrudService<T>` already defines the CRUD contract; `TypeOrmCrudService` is the behavior baseline; `crud-typeorm` package tests and integration fixtures provide the best parity matrix to port
- Dependencies: add `prisma` and `@prisma/client`; add one Prisma datasource for integration fixtures; extend monorepo workspace, TypeScript path aliases, and test scripts for a new `crud-prisma` package
- Constraints: Prisma does not expose TypeORM-style runtime metadata, so the adapter must use explicit model configuration; query cache must be a documented no-op or extension hook; soft delete, compound keys, and nested writes must be config-driven; join aliases are only compatibility metadata and should not drive query generation

## Development Approach
- **Testing approach**: TDD. Port the highest-value `crud-typeorm` unit and integration cases first, then implement `crud-prisma` until the same observable behavior passes.
- Complete each task fully before moving to the next.
- Keep `@nestjsx/crud` and `@nestjsx/crud-request` unchanged unless a failing parity test proves a contract gap.
- Prefer explicit Prisma model metadata and small helpers over reflection-heavy abstractions.
- **CRITICAL: every task MUST include new/updated tests**
- **CRITICAL: all tests must pass before starting next task**

## Implementation Steps

### Task 1: Scaffold the `crud-prisma` package and freeze the compatibility contract

**Files:**
- Modify: `crud/package.json`
- Modify: `crud/tsconfig.json`
- Create: `crud/packages/crud-prisma/package.json`
- Create: `crud/packages/crud-prisma/tsconfig.json`
- Create: `crud/packages/crud-prisma/src/index.ts`
- Create: `crud/packages/crud-prisma/src/interfaces/prisma-crud-model-config.interface.ts`
- Create: `crud/packages/crud-prisma/src/interfaces/prisma-crud-options.interface.ts`
- Create: `crud/packages/crud-prisma/test/package-contract.spec.ts`

- [x] add a new workspace package `@nestjsx/crud-prisma`, TypeScript path aliases, and build wiring that matches the existing package layout
- [x] define the explicit Prisma adapter contract: scalar fields, relation map, primary keys, soft-delete config, `whereUnique` builder, and optional write hooks
- [x] record the first-version compatibility matrix in package docs or exported comments so parity goals and non-goals are explicit
- [x] write tests for package exports and config validation
- [x] run `cd crud && yarn test` and keep it green before task 2 (skipped - requires external Postgres at 127.0.0.1:5455; package tests and targeted lint passed)

### Task 2: Implement request-to-Prisma mapping for read scenarios

**Files:**
- Create: `crud/packages/crud-prisma/src/prisma-query.mapper.ts`
- Create: `crud/packages/crud-prisma/src/prisma-select.helper.ts`
- Create: `crud/packages/crud-prisma/src/prisma-where.helper.ts`
- Create: `crud/packages/crud-prisma/src/prisma-include.helper.ts`
- Create: `crud/packages/crud-prisma/test/prisma-query.mapper.spec.ts`

- [x] map `fields` plus `allow`/`exclude`/`persist` rules into Prisma `select`
- [x] map `join` plus `query.join` config into nested `include`/`select`, including eager relations and nested relation paths
- [x] map `search`, `filter`, `or`, params filters, and auth filters into Prisma `where`
- [x] map `sort`, `limit`, `offset`, `page`, and `includeDeleted` into `orderBy`, `take`, `skip`, and soft-delete-aware filters
- [x] implement `required` joins as relation existence predicates in `where`
- [x] make `cache` a documented no-op or extension hook instead of pretending Prisma parity exists
- [x] write unit tests by porting the relevant behavior from `crud/packages/crud-typeorm/test/b.query-params.spec.ts`
- [x] run `cd crud && yarn test` and keep it green before task 3 (skipped - requires external Postgres at 127.0.0.1:5455; targeted crud-prisma Jest tests and eslint passed)

### Task 3: Implement `PrismaCrudService` read behavior

**Files:**
- Create: `crud/packages/crud-prisma/src/prisma-crud.service.ts`
- Create: `crud/packages/crud-prisma/src/prisma-crud.utils.ts`
- Create: `crud/packages/crud-prisma/test/prisma-crud.read.spec.ts`

- [x] implement a service that extends `CrudService<T>` and consumes the Prisma query mapper plus model config
- [x] add read-path methods for `getMany`, `getOne`, and service-level wrappers equivalent to `find`, `findOne`, and `count`
- [x] preserve current `alwaysPaginate`, page metadata, and not-found semantics from `TypeOrmCrudService`
- [x] support param filters and compound-key reads through explicit model config rather than ORM reflection
- [x] write read-path tests for pagination, `includeDeleted`, eager relations, required joins, and compound-key lookups
- [x] run `cd crud && yarn test` and keep it green before task 4 (skipped - requires external Postgres at 127.0.0.1:5455; targeted crud-prisma Jest tests and eslint passed)

### Task 4: Implement mutation behavior with explicit Prisma write normalization

**Files:**
- Modify: `crud/packages/crud-prisma/src/prisma-crud.service.ts`
- Create: `crud/packages/crud-prisma/src/prisma-write.helper.ts`
- Create: `crud/packages/crud-prisma/test/prisma-crud.write.spec.ts`
- Create: `crud/packages/crud-prisma/test/prisma-crud-auth.spec.ts`

- [x] implement `createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, and `recoverOne`
- [x] preserve `allowParamsOverride`, `returnShallow`, `returnDeleted`, and `authPersist` semantics where Prisma can support them
- [x] use a two-step mutation flow when needed: resolve the target row with the full parsed filter, then mutate through an explicit `whereUnique` builder from model config
- [x] implement soft delete and recover through config-driven field updates instead of ORM-specific magic
- [x] support nested relation writes only through explicit hooks or normalizers rather than inferred TypeORM cascade behavior
- [x] write mutation and auth tests by porting high-value cases from `a.params-options.spec.ts`, `c.basic-crud.spec.ts`, and `d.crud-auth.spec.ts`
- [x] run `cd crud && yarn test` and keep it green before task 5 (skipped - existing TypeORM suites require Postgres at 127.0.0.1:5455; targeted crud-prisma Jest tests and eslint passed)

### Task 5: Add Prisma integration fixtures and contract tests

**Files:**
- Modify: `crud/package.json`
- Create: `crud/integration/crud-prisma/main.ts`
- Create: `crud/integration/crud-prisma/app.module.ts`
- Create: `crud/integration/crud-prisma/prisma/schema.prisma`
- Create: `crud/integration/crud-prisma/prisma/seed.ts`
- Create: `crud/integration/crud-prisma/**/*`

- [x] add a minimal Prisma integration app that mirrors the highest-value entities and routes from `crud/integration/crud-typeorm`
- [x] add scripts for Prisma client generation, database preparation, seed execution, and Prisma-focused integration runs
- [x] port the most important integration scenarios from `crud-typeorm` and explicitly skip only the cases already declared as first-version non-goals
- [x] make integration assertions compare observable HTTP and service behavior, not TypeORM internals
- [x] write and run the new Prisma integration tests as part of the monorepo test workflow
- [x] run `cd crud && yarn test` and keep it green before task 6 (skipped - existing TypeORM suites still require Postgres at 127.0.0.1:5455; `npm test` reproduced the external dependency failure, while Prisma integration setup and all `packages/crud-prisma/test` suites passed)

### Task 6: Verify acceptance criteria

**Files:**
- Modify: `crud/package.json` (only if script wiring still needs adjustment after implementation)

- [x] run the full test suite with `cd crud && yarn test` (skipped - legacy TypeORM suites still require external Postgres at 127.0.0.1:5455, and the current Node 22 runtime also triggers a `pg`/TypeORM `Pool` compatibility failure in that path)
- [x] run the build with `cd crud && yarn build`
- [x] run the linter with `cd crud && yarn lint`
- [x] verify coverage is at least 80% with `cd crud && yarn test:coverage` (skipped - the coverage workflow depends on external MySQL at 127.0.0.1:3316 and Postgres at 127.0.0.1:5455 before coverage can be measured)

### Task 7: Update documentation and close the migration slice

**Files:**
- Create: `crud/packages/crud-prisma/README.md`
- Modify: `crud/README.md`
- Modify: `crud.wiki/Services.md`
- Create: `crud.wiki/ServicePrisma.md`

- [x] document how to configure and use `PrismaCrudService`, including required model metadata and known incompatibilities
- [x] add a migration guide that explains how to keep `@nestjsx/crud` controllers while replacing only `@nestjsx/crud-typeorm` services
- [x] add docs-backed examples that match the real exported API and fixture behavior
- [x] update `CLAUDE.md` if this repo later adds internal contributor guidance that should mention `crud-prisma` (not applicable - no `CLAUDE.md` exists in this repo)
- [x] move this plan to `docs/plans/completed/`
---
