"use server"

import { db } from "@chatbotx.io/database/client"
import {
  productAddonModel,
  productModel,
  productVariantModel,
  productVariantOptionModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateProductRequest,
  createProductRequest,
} from "../schema/action"

export const createProductAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createProductRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateProductRequest
    }) => await createProduct({ workspaceId, ...parsedInput }),
  )

export const createProduct = async (
  input: CreateProductRequest & { workspaceId: string },
) => {
  const { variantOptions, variants, addons, ...productData } = input

  const product = await db
    .insert(productModel)
    .values({
      id: createId(),
      workspaceId: input.workspaceId,
      name: productData.name,
      shortDescription: productData.shortDescription ?? null,
      longDescription: productData.longDescription ?? null,
      price: productData.price,
      taxes: productData.taxes,
      discount: productData.discount,
      sku: productData.sku ?? null,
      inventoryPolicy: productData.inventoryPolicy,
      inventoryQuantity: productData.inventoryQuantity,
      allowOutOfStockPurchase: productData.allowOutOfStockPurchase,
      images: productData.images
        .filter(({ url }) => !!url)
        .map(({ mode, url }) => ({ type: mode, url })),
      tags: productData.tags,
      vendor: productData.vendor ?? null,
      rank: productData.rank,
      category: productData.category ?? null,
      subcategory: productData.subcategory ?? null,
      isSearchable: productData.isSearchable,
      allowSpecialRequest: productData.allowSpecialRequest,
      isAddonOnly: productData.isAddonOnly,
    })
    .returning()
    .then((rows) => rows[0])

  if (!product) {
    throw new Error("Failed to create product")
  }

  if (variantOptions.length > 0) {
    await db.insert(productVariantOptionModel).values(
      variantOptions.map((option, index) => ({
        id: createId(),
        productId: product.id,
        name: option.name,
        values: option.values,
        position: option.position ?? index,
      })),
    )
  }

  if (variants.length > 0) {
    await db.insert(productVariantModel).values(
      variants.map((variant) => ({
        id: createId(),
        productId: product.id,
        combination: variant.combination,
        price: variant.price,
        isEnabled: variant.isEnabled,
      })),
    )
  }

  if (addons.length > 0) {
    await db.insert(productAddonModel).values(
      addons.map((addon) => ({
        id: createId(),
        productId: product.id,
        name: addon.name,
        maxSelections: addon.maxSelections,
        addonProductIds: addon.addonProductIds,
      })),
    )
  }

  return { data: product }
}
