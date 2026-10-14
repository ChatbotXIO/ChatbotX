"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateMiniAppAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    const miniApp = await miniAppService.duplicate({ workspaceId, id })
    return { id: miniApp.id }
  })
