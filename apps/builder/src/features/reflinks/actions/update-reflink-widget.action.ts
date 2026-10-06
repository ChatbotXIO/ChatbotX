"use server"

import { reflinkService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateReflinkWidgetRequest } from "../schema/action"

export const updateReflinkWidgetAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateReflinkWidgetRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await reflinkService.updateWidgetSettings({ workspaceId, id }, parsedInput)
  })
