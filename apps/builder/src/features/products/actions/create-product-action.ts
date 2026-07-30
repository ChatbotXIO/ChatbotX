"use server"

import { productService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { type ProductFormRequest, productFormRequest } from "../schema/action"

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
  const product = await productService.createFull(input)

  return { data: product }
}
