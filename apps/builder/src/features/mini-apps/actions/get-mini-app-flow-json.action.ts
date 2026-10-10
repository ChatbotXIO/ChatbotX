"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/** Read-only: the table loads the Flow JSON on demand (the list omits it). */
export const getMiniAppFlowJsonAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    const miniApp = await miniAppService.findOrFail({ workspaceId, id })
    return { flowJson: miniApp.flowJson }
  })
