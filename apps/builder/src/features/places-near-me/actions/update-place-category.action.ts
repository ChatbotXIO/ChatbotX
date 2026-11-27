"use server"

import { placeCategoryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { throwCategoryFormError } from "../lib/category-form-error"
import { placeCategoryFormSchema } from "../schema/action"

export const updatePlaceCategoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(placeCategoryFormSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, categoryId],
      parsedInput,
    }) => {
      try {
        return await placeCategoryService.update({
          workspaceId,
          categoryId,
          data: parsedInput,
        })
      } catch (error) {
        return throwCategoryFormError(error)
      }
    },
  )
