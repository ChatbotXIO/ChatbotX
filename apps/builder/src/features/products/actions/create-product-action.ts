"use server"

import { db } from "@chatbotx.io/database/client"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { type ProductFormRequest, productFormRequest } from "../schema/action"
import {
  productAddonService,
  productService,
  productVariantOptionService,
  productVariantService,
} from "../services"

export const createProductAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(productFormRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ProductFormRequest
    }) => await createProduct({ workspaceId, ...parsedInput }),
  )

export const createProduct = async (
  input: ProductFormRequest & { workspaceId: string },
) => {
  const { variantOptions, variants, addons, ...productData } = input

  const product = await db.transaction(async (tx) => {
    const created = await productService.create({ data: productData, tx })

    await Promise.all([
      productVariantOptionService.createBulk({
        productId: created.id,
        options: variantOptions,
        tx,
      }),
      productVariantService.createBulk({
        productId: created.id,
        variants,
        tx,
      }),
      productAddonService.createBulk({
        productId: created.id,
        addons,
        tx,
      }),
    ])

    return created
  })

  return { data: product }
}
