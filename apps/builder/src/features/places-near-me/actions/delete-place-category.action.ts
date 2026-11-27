"use server"

import { placeCategoryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deletePlaceCategoryAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, categoryId] }) =>
      await placeCategoryService.delete({ workspaceId, categoryId }),
  )
