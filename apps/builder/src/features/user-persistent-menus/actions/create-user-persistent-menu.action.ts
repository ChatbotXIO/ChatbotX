"use server"

import { createUserPersistentMenu } from "@chatbotx.io/database/repositories"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { createUserPersistentMenuRequest } from "../schema/action"

export const createUserPersistentMenuAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createUserPersistentMenuRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await createUserPersistentMenu({
      workspaceId,
      name: parsedInput.name,
      menus: parsedInput.persistentMenus,
    })
  })
