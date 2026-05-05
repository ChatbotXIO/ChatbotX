import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { productModel } from "@chatbotx.io/database/schema"
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
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { notFoundException } from "@/lib/errors/exception"
import type { ListProductsRequest, ListProductsResponse } from "../schema/query"

export type ProductWithRelations = ProductModel & {
  variantOptions: ProductVariantOptionModel[]
  variants: ProductVariantModel[]
  addons: ProductAddonModel[]
}

export const listProductsRSC = async (
  input: ListProductsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return listProducts(input)
}

export async function listProducts(
  input: ListProductsRequest & { workspaceId: string },
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
    }),
    db.$count(productModel, relationsFilterToSQL(productModel, where)),
  ])

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount }
}

export async function findProduct(
  id: string,
  workspaceId: string,
): Promise<ProductWithRelations> {
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
  return product as ProductWithRelations
}

export async function getProductsForSelect(
  workspaceId: string,
): Promise<{ value: string; label: string }[]> {
  const products = await db.query.productModel.findMany({
    where: { workspaceId },
    columns: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  return products.map((p) => ({ value: p.id, label: p.name }))
}
