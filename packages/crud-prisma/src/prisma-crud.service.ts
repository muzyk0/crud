import { NotFoundException } from '@nestjs/common';
import { CreateManyDto, CrudRequest, CrudService, GetManyDefaultResponse } from '@nestjsx/crud';
import { ParsedRequestParams } from '@nestjsx/crud-request';

import { mapCrudRequestToPrisma, PrismaCrudQueryArgs } from './prisma-query.mapper';
import {
  assertPrismaCrudDelegate,
  assertPrismaCrudDelegateMethod,
  buildPrismaCrudCountArgs,
  hasOnlyPrismaCrudPrimaryParams,
  mergePrismaCrudOptions,
  PrismaCrudCountArgs,
  PrismaCrudDelegate,
  PrismaCrudFindManyArgs,
  PrismaCrudFindOneArgs,
  PrismaCrudFindUniqueArgs,
  PrismaCrudServiceOptions,
} from './prisma-crud.utils';
import { PrismaCrudOptions } from './interfaces/prisma-crud-options.interface';
import {
  buildPrismaCrudCreateData,
  buildPrismaCrudDeleteWhere,
  buildPrismaCrudRecoverWhere,
  buildPrismaCrudReplaceData,
  buildPrismaCrudSoftDeleteData,
  buildPrismaCrudUpdateData,
  buildPrismaCrudMutationWhere,
  clonePrismaCrudRequestWithEntity,
  hasPrismaCrudEntityPrimaryLookup,
} from './prisma-write.helper';

export class PrismaCrudService<T, TCreate = Partial<T>, TUpdate = Partial<T>> extends CrudService<T> {
  protected readonly delegate: PrismaCrudDelegate<T>;

  protected readonly serviceOptions: PrismaCrudOptions<T, TCreate, TUpdate>;

  constructor(delegate: PrismaCrudDelegate<T>, options: PrismaCrudServiceOptions<T, TCreate, TUpdate>) {
    super();

    this.delegate = assertPrismaCrudDelegate(delegate);
    this.serviceOptions = mergePrismaCrudOptions(options);
  }

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const options = this.getRequestOptions(req);
    const { args } = mapCrudRequestToPrisma(req.parsed, options);

    return this.doGetMany(args, req.parsed, options);
  }

  public async getOne(req: CrudRequest): Promise<T> {
    return this.getOneOrFail(req);
  }

  public find(args?: PrismaCrudFindManyArgs): Promise<T[]> {
    return this.delegate.findMany(args);
  }

  public findOne(args?: PrismaCrudFindOneArgs): Promise<T | null> {
    return this.delegate.findFirst(args);
  }

  public count(args?: PrismaCrudCountArgs): Promise<number> {
    return this.delegate.count(args);
  }

  public async createOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const options = this.getRequestOptions(req);
    const create = assertPrismaCrudDelegateMethod(this.delegate, 'create');
    const data = await buildPrismaCrudCreateData(options.model, dto as TCreate, req.parsed);

    if (!data) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const created = await create({ data });

    return options.routes.createOneBase && options.routes.createOneBase.returnShallow
      ? created
      : this.refetchMutationResult(req, created, options);
  }

  public async createMany(req: CrudRequest, dto: CreateManyDto<T | Partial<T>>): Promise<T[]> {
    if (!dto || !Array.isArray(dto.bulk) || !dto.bulk.length) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const options = this.getRequestOptions(req);
    const create = assertPrismaCrudDelegateMethod(this.delegate, 'create');
    const bulk = (
      await Promise.all(dto.bulk.map((one) => buildPrismaCrudCreateData(options.model, one as TCreate, req.parsed)))
    ).filter((one) => !!one) as TCreate[];

    if (!bulk.length) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    return Promise.all(bulk.map((data) => create({ data })));
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const options = this.getRequestOptions(req);
    const update = assertPrismaCrudDelegateMethod(this.delegate, 'update');
    const routeOptions = options.routes.updateOneBase || {};
    const found = await this.getOneOrFail(req);
    const data = await buildPrismaCrudUpdateData(
      options.model,
      found,
      dto as TUpdate,
      req.parsed,
      routeOptions.allowParamsOverride,
    );

    if (!data) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const updated = await update({
      where: buildPrismaCrudMutationWhere(req.parsed, options.model, found),
      data,
    });

    return routeOptions.returnShallow ? updated : this.refetchMutationResult(req, updated, options);
  }

  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const options = this.getRequestOptions(req);
    const routeOptions = options.routes.replaceOneBase || {};
    const create = assertPrismaCrudDelegateMethod(this.delegate, 'create');
    const update = assertPrismaCrudDelegateMethod(this.delegate, 'update');
    let found: T | null;

    try {
      found = await this.getOneOrFail(req);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }

      found = null;
    }

    const data = await buildPrismaCrudReplaceData(
      options.model,
      found,
      dto as TUpdate,
      req.parsed,
      routeOptions.allowParamsOverride,
    );

    if (!data) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    if (!found) {
      const created = await create({ data: data as unknown as TCreate });

      return routeOptions.returnShallow ? created : this.refetchMutationResult(req, created, options);
    }

    const replaced = await update({
      where: buildPrismaCrudMutationWhere(req.parsed, options.model, found),
      data,
    });

    return routeOptions.returnShallow ? replaced : this.refetchMutationResult(req, replaced, options);
  }

  public async deleteOne(req: CrudRequest): Promise<void | T> {
    const options = this.getRequestOptions(req);
    const update = options.query.softDelete ? assertPrismaCrudDelegateMethod(this.delegate, 'update') : undefined;
    const remove = !options.query.softDelete ? assertPrismaCrudDelegateMethod(this.delegate, 'delete') : undefined;
    const found = await this.getOneOrFail(req);
    const where = await buildPrismaCrudDeleteWhere(options.model, req.parsed, found);
    const toReturn = options.routes.deleteOneBase && options.routes.deleteOneBase.returnDeleted ? found : undefined;

    if (options.query.softDelete) {
      await update({
        where,
        data: buildPrismaCrudSoftDeleteData(options.model, 'delete'),
      });
    } else {
      await remove({ where });
    }

    return toReturn;
  }

  public async recoverOne(req: CrudRequest): Promise<void | T> {
    const options = this.getRequestOptions(req);
    const update = assertPrismaCrudDelegateMethod(this.delegate, 'update');
    const recovered = await this.getOneOrFail(req, true);
    const result = await update({
      where: await buildPrismaCrudRecoverWhere(options.model, req.parsed, recovered),
      data: buildPrismaCrudSoftDeleteData(options.model, 'recover'),
    });

    return options.routes.recoverOneBase && options.routes.recoverOneBase.returnRecovered
      ? this.refetchMutationResult(req, result, options)
      : result;
  }

  protected async doGetMany(
    args: PrismaCrudQueryArgs,
    parsed: ParsedRequestParams,
    options: PrismaCrudOptions<T, TCreate, TUpdate>,
  ): Promise<GetManyDefaultResponse<T> | T[]> {
    if (this.decidePagination(parsed, options)) {
      const [data, total] = await Promise.all([this.find(args), this.count(buildPrismaCrudCountArgs(args.where))]);

      return this.createPageInfo(data, total, args.take || total, args.skip || 0);
    }

    return this.find(args);
  }

  protected async getOneOrFail(req: CrudRequest, includeDeleted = false): Promise<T> {
    const options = this.getRequestOptions(req);
    const parsed = includeDeleted ? { ...req.parsed, includeDeleted: 1 } : req.parsed;
    const { args } = mapCrudRequestToPrisma(parsed, options);
    const uniqueArgs = this.getUniqueLookupArgs(parsed, args, options);
    const found = uniqueArgs ? await this.delegate.findUnique(uniqueArgs) : await this.findOne(args);

    if (!found) {
      this.throwNotFoundException(options.model.modelName);
    }

    return found;
  }

  protected getRequestOptions(req: CrudRequest): PrismaCrudOptions<T, TCreate, TUpdate> {
    return mergePrismaCrudOptions(this.serviceOptions, req && req.options ? req.options : {});
  }

  protected async refetchMutationResult(
    req: CrudRequest,
    entity: T,
    options: PrismaCrudOptions<T, TCreate, TUpdate>,
  ): Promise<T> {
    if (!hasPrismaCrudEntityPrimaryLookup(req.parsed, options.model, entity)) {
      return entity;
    }

    return this.getOneOrFail(clonePrismaCrudRequestWithEntity(req, options.model, entity));
  }

  protected getUniqueLookupArgs(
    parsed: ParsedRequestParams,
    args: PrismaCrudQueryArgs,
    options: PrismaCrudOptions<T, TCreate, TUpdate>,
  ): PrismaCrudFindUniqueArgs | undefined {
    if (typeof this.delegate.findUnique !== 'function') {
      return undefined;
    }

    if (!hasOnlyPrismaCrudPrimaryParams(parsed, options.model)) {
      return undefined;
    }

    if (
      parsed.search ||
      (parsed.filter && parsed.filter.length) ||
      (parsed.or && parsed.or.length) ||
      (parsed.join && parsed.join.length) ||
      options.query.softDelete
    ) {
      return undefined;
    }

    return {
      where: options.model.whereUnique(parsed.paramsFilter.reduce<Record<string, unknown>>((params, filter) => {
        params[filter.field] = filter.value;
        return params;
      }, {})),
      select: args.select,
    };
  }
}
