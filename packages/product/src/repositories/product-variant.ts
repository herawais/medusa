import {
  FilterQuery as MikroFilterQuery,
  FindOptions as MikroOptions,
  LoadStrategy,
} from "@mikro-orm/core"
import { deduplicateIfNecessary } from "../utils"
import { ProductVariant } from "@models"
import { Context, DAL } from "@medusajs/types"
import { DalRepositoryBase } from "./base"

export class ProductVariantRepository extends DalRepositoryBase<ProductVariant> {
  constructor() {
    // @ts-ignore
    super(...arguments)
  }

  async find(
    findOptions: DAL.FindOptions<ProductVariant> = { where: {} },
    context: Context = {}
  ): Promise<ProductVariant[]> {
    // Spread is used to copy the options in case of manipulation to prevent side effects
    const findOptions_ = { ...findOptions }

    findOptions_.options ??= {}
    findOptions_.options.limit ??= 15

    if (findOptions_.options.populate) {
      deduplicateIfNecessary(findOptions_.options.populate)
    }

    if (context.transactionManager) {
      Object.assign(findOptions_.options, { ctx: context.transactionManager })
    }

    Object.assign(findOptions_.options, {
      strategy: LoadStrategy.SELECT_IN,
    })

    return await this.manager_.find(
      ProductVariant,
      findOptions_.where as MikroFilterQuery<ProductVariant>,
      findOptions_.options as MikroOptions<ProductVariant>
    )
  }

  async findAndCount(
    findOptions: DAL.FindOptions<ProductVariant> = { where: {} },
    context: Context = {}
  ): Promise<[ProductVariant[], number]> {
    // Spread is used to copy the options in case of manipulation to prevent side effects
    const findOptions_ = { ...findOptions }

    findOptions_.options ??= {}
    findOptions_.options.limit ??= 15

    if (findOptions_.options.populate) {
      deduplicateIfNecessary(findOptions_.options.populate)
    }

    if (context.transactionManager) {
      Object.assign(findOptions_.options, { ctx: context.transactionManager })
    }

    Object.assign(findOptions_.options, {
      strategy: LoadStrategy.SELECT_IN,
    })

    return await this.manager_.findAndCount(
      ProductVariant,
      findOptions_.where as MikroFilterQuery<ProductVariant>,
      findOptions_.options as MikroOptions<ProductVariant>
    )
  }
}
