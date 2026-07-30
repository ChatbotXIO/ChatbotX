"use server"

import { productCategoryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteProductCategoryAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, categoryId] }) => {
    await productCategoryService.delete({ workspaceId, categoryId })
  })
