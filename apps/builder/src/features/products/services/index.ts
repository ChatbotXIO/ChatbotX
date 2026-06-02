import { notFoundException } from "@chatbotx.io/business/errors"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  productAddonModel,
  productModel,
  productVariantModel,
  productVariantOptionModel,
} from "@chatbotx.io/database/schema"
import type {
  ProductAddonModel,
  ProductModel,
  ProductVariantModel,
  ProductVariantOptionModel,
} from "@chatbotx.io/database/types"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "@/features/common/base.service"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  AddonInsertData,
  ProductInsertData,
  VariantInsertData,
  VariantOptionInsertData,
} from "../schema/action"
import type { ListProductsRequest, ListProductsResponse } from "../schema/query"
import type { ProductDetailResource } from "../schema/resource"

class ProductService extends BaseService {
  async create(props: {
    data: ProductInsertData
    tx?: DatabaseClient
  }): Promise<ProductModel> {
    const { data, tx = db } = props
    const { images, ...productData } = data

    const product = await tx
      .insert(productModel)
      .values({
        id: createId(),
        ...productData,
        images: images.map(({ mode, url }) => ({ type: mode, url })),
      })
      .returning()
      .then((rows) => rows[0])

    if (!product) {
      throw new Error("Failed to create product")
    }

    return product
  }

  async update(props: {
    productId: string
    workspaceId?: string
    data: Partial<Omit<ProductInsertData, "workspaceId">> & {
      isActive?: boolean
    }
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, workspaceId, data, tx = db } = props
    const { images, ...productData } = data

    const whereCondition = workspaceId
      ? and(
          eq(productModel.id, productId),
          eq(productModel.workspaceId, workspaceId),
        )
      : eq(productModel.id, productId)

    await tx
      .update(productModel)
      .set({
        ...productData,
        ...(images && {
          images: images.map(({ mode, url }) => ({ type: mode, url })),
        }),
      })
      .where(whereCondition)
  }

  async delete(props: {
    ids: string[]
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { ids, workspaceId, tx = db } = props
    await tx
      .delete(productModel)
      .where(
        and(
          inArray(productModel.id, ids),
          eq(productModel.workspaceId, workspaceId),
        ),
      )
  }

  async list(
    input: ListProductsRequest & {
      workspaceId: string
      columns?: Partial<Record<keyof ProductModel, boolean>>
    },
  ): Promise<ListProductsResponse> {
    const where = {
      workspaceId: input.workspaceId,
      name: input.name ? { ilike: `%${input.name.toLowerCase()}%` } : undefined,
    }
    const pagination = parsePagination(input)
    const orderBy = parseOrderByAsObject(productModel, input)

    const [data, total] = await Promise.all([
      db.query.productModel.findMany({
        where,
        orderBy,
        ...pagination,
        columns: input.columns,
      }),
      db.$count(productModel, relationsFilterToSQL(productModel, where)),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(total / pagination.limit)
      : 1
    return { data: data as ListProductsResponse["data"], pageCount }
  }

  async listRSC(
    input: ListProductsRequest & {
      workspaceId: string
      columns?: Partial<Record<keyof ProductModel, boolean>>
    },
  ): Promise<ListProductsResponse> {
    await assertCurrentUserCanAccessChatbot(input.workspaceId)
    return this.list(input)
  }

  async findById(
    id: string,
    workspaceId: string,
  ): Promise<ProductDetailResource> {
    const product = await db.query.productModel.findFirst({
      where: { id, workspaceId },
      with: {
        variantOptions: true,
        variants: true,
        addons: true,
      },
    })
    if (!product) {
      throw notFoundException("Product does not exist.")
    }
    return product as ProductDetailResource
  }
}

class ProductVariantOptionService extends BaseService {
  async createBulk(props: {
    productId: string
    options: VariantOptionInsertData[]
    tx?: DatabaseClient
  }): Promise<ProductVariantOptionModel[]> {
    const { productId, options, tx = db } = props
    if (options.length === 0) {
      return []
    }
    return await tx
      .insert(productVariantOptionModel)
      .values(
        options.map((option) => ({ id: createId(), productId, ...option })),
      )
      .returning()
  }

  async deleteByProductId(props: {
    productId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, tx = db } = props
    await tx
      .delete(productVariantOptionModel)
      .where(eq(productVariantOptionModel.productId, productId))
  }
}

class ProductVariantService extends BaseService {
  async createBulk(props: {
    productId: string
    variants: VariantInsertData[]
    tx?: DatabaseClient
  }): Promise<ProductVariantModel[]> {
    const { productId, variants, tx = db } = props
    if (variants.length === 0) {
      return []
    }
    return await tx
      .insert(productVariantModel)
      .values(
        variants.map((variant) => ({ id: createId(), productId, ...variant })),
      )
      .returning()
  }

  async deleteByProductId(props: {
    productId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, tx = db } = props
    await tx
      .delete(productVariantModel)
      .where(eq(productVariantModel.productId, productId))
  }
}

class ProductAddonService extends BaseService {
  async createBulk(props: {
    productId: string
    addons: AddonInsertData[]
    tx?: DatabaseClient
  }): Promise<ProductAddonModel[]> {
    const { productId, addons, tx = db } = props
    if (addons.length === 0) {
      return []
    }
    return await tx
      .insert(productAddonModel)
      .values(addons.map((addon) => ({ id: createId(), productId, ...addon })))
      .returning()
  }

  async deleteByProductId(props: {
    productId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, tx = db } = props
    await tx
      .delete(productAddonModel)
      .where(eq(productAddonModel.productId, productId))
  }
}

export const productService = new ProductService()
export const productVariantOptionService = new ProductVariantOptionService()
export const productVariantService = new ProductVariantService()
export const productAddonService = new ProductAddonService()
