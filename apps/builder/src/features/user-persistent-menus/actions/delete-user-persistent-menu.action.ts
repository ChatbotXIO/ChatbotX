"use server"

import { deleteUserPersistentMenus } from "@chatbotx.io/database/repositories"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteUserPersistentMenuAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await deleteUserPersistentMenus({ workspaceId, ids: parsedInput.ids })
  })
