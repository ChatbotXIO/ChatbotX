"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  productAddonModel,
  productModel,
  productVariantModel,
  productVariantOptionModel,
} from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateProductRequest,
  createProductRequest,
} from "../schema/action"

export const updateProductAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createProductRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, productId], parsedInput }) =>
      await updateProduct({ workspaceId, productId, ...parsedInput }),
  )

export const updateProduct = async (
  input: CreateProductRequest & { workspaceId: string; productId: string },
) => {
  const {
    variantOptions,
    variants,
    addons,
    productId,
    workspaceId: _workspaceId,
    ...productData
  } = input

  await db
    .update(productModel)
    .set({
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
    .where(eq(productModel.id, productId))

  await Promise.all([
    db
      .delete(productVariantOptionModel)
      .where(eq(productVariantOptionModel.productId, productId)),
    db
      .delete(productVariantModel)
      .where(eq(productVariantModel.productId, productId)),
    db
      .delete(productAddonModel)
      .where(eq(productAddonModel.productId, productId)),
  ])

  const insertions: Promise<unknown>[] = []

  if (variantOptions.length > 0) {
    insertions.push(
      db.insert(productVariantOptionModel).values(
        variantOptions.map((option, index) => ({
          id: createId(),
          productId,
          name: option.name,
          values: option.values,
          position: option.position ?? index,
        })),
      ),
    )
  }

  if (variants.length > 0) {
    insertions.push(
      db.insert(productVariantModel).values(
        variants.map((variant) => ({
          id: createId(),
          productId,
          combination: variant.combination,
          price: variant.price,
          isEnabled: variant.isEnabled,
        })),
      ),
    )
  }

  if (addons.length > 0) {
    insertions.push(
      db.insert(productAddonModel).values(
        addons.map((addon) => ({
          id: createId(),
          productId,
          name: addon.name,
          maxSelections: addon.maxSelections,
          addonProductIds: addon.addonProductIds,
        })),
      ),
    )
  }

  await Promise.all(insertions)
}
