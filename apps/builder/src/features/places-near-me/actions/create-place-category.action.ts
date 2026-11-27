"use server"

import { placeCategoryService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { throwCategoryFormError } from "../lib/category-form-error"
import { placeCategoryFormSchema } from "../schema/action"

export const createPlaceCategoryAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(placeCategoryFormSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      return await placeCategoryService.create({ workspaceId, ...parsedInput })
    } catch (error) {
      return throwCategoryFormError(error)
    }
  })
