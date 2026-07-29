"use server"

import { productCategoryService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { productCategoryFormSchema } from "../schema/action"

export const createProductCategoryAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(productCategoryFormSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await productCategoryService.create({ workspaceId, ...parsedInput }),
  )
