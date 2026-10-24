"use server"

import { productCategoryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  productCategoryFormSchema,
  productCategoryVisibleSchema,
} from "../schema/action"

export const updateProductCategoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(productCategoryFormSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, categoryId], parsedInput }) =>
      await productCategoryService.update({
        workspaceId,
        categoryId,
        ...parsedInput,
      }),
  )

export const toggleProductCategoryVisibleAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(productCategoryVisibleSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, categoryId], parsedInput }) =>
      await productCategoryService.update({
        workspaceId,
        categoryId,
        isVisible: parsedInput.isVisible,
      }),
  )
