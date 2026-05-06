"use server"

import { db } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateProductRequest,
  createProductRequest,
} from "../schema/action"
import {
  productAddonService,
  productService,
  productVariantOptionService,
  productVariantService,
} from "../services"

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
  const { variantOptions, variants, addons, productId, ...productData } = input

  await db.transaction(async (tx) => {
    await productService.update({ productId, data: productData, tx })

    await Promise.all([
      productVariantOptionService.deleteByProductId({ productId, tx }),
      productVariantService.deleteByProductId({ productId, tx }),
      productAddonService.deleteByProductId({ productId, tx }),
    ])

    await Promise.all([
      productVariantOptionService.createBulk({
        productId,
        options: variantOptions,
        tx,
      }),
      productVariantService.createBulk({ productId, variants, tx }),
      productAddonService.createBulk({ productId, addons, tx }),
    ])
  })
}
