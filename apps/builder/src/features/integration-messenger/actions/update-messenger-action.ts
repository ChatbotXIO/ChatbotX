"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateMessenger } from "../lib/update-messenger-settings"
import { updateMessengerRequest } from "../schema/action"

export const updateMessengerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateMessengerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [_, id],
      parsedInput,
      ctx: { workspace },
    } = props

    return await updateMessenger(
      {
        workspaceId: workspace.id,
        id,
      },
      parsedInput,
    )
  })
