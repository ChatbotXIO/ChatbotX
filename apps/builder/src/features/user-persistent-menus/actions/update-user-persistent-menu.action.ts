"use server"

import { updateUserPersistentMenu } from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateUserPersistentMenuRequest } from "../schema/action"

export const updateUserPersistentMenuAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateUserPersistentMenuRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await updateUserPersistentMenu({
      id,
      workspaceId,
      name: parsedInput.name,
      menus: parsedInput.persistentMenus,
    })
  })
