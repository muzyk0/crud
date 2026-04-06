import { CreateManyDto, CrudRequest, CrudService, GetManyDefaultResponse } from '@nestjsx/crud';
import { ParsedRequestParams } from '@nestjsx/crud-request';

import { mapCrudRequestToPrisma, PrismaCrudQueryArgs } from './prisma-query.mapper';
import {
  assertPrismaCrudDelegate,
  buildPrismaCrudCountArgs,
  hasPrismaCrudPrimaryParams,
  mergePrismaCrudOptions,
  PrismaCrudCountArgs,
  PrismaCrudDelegate,
  PrismaCrudFindManyArgs,
  PrismaCrudFindOneArgs,
  PrismaCrudFindUniqueArgs,
  PrismaCrudServiceOptions,
} from './prisma-crud.utils';
import { PrismaCrudOptions } from './interfaces/prisma-crud-options.interface';

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
    void req;
    void dto;
    return this.throwMethodNotImplemented('createOne');
  }

  public async createMany(req: CrudRequest, dto: CreateManyDto<T | Partial<T>>): Promise<T[]> {
    void req;
    void dto;
    return this.throwMethodNotImplemented('createMany');
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    void req;
    void dto;
    return this.throwMethodNotImplemented('updateOne');
  }

  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    void req;
    void dto;
    return this.throwMethodNotImplemented('replaceOne');
  }

  public async deleteOne(req: CrudRequest): Promise<void | T> {
    void req;
    return this.throwMethodNotImplemented('deleteOne');
  }

  public async recoverOne(req: CrudRequest): Promise<void | T> {
    void req;
    return this.throwMethodNotImplemented('recoverOne');
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

  protected getUniqueLookupArgs(
    parsed: ParsedRequestParams,
    args: PrismaCrudQueryArgs,
    options: PrismaCrudOptions<T, TCreate, TUpdate>,
  ): PrismaCrudFindUniqueArgs | undefined {
    if (typeof this.delegate.findUnique !== 'function') {
      return undefined;
    }

    if (!hasPrismaCrudPrimaryParams(parsed, options.model)) {
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

  protected throwMethodNotImplemented<TResult>(method: string): TResult {
    throw new Error(`crud-prisma: ${method} is not implemented yet`);
  }
}
