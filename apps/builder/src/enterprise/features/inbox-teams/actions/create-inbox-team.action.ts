"use server"

import { db } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createInboxTeamRequest } from "../schema/action"

export const createInboxTeamAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createInboxTeamRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await db.transaction(async (tx) => {
      const inboxTeamId = createId()
      await tx.insert(inboxTeamModel).values({
        id: inboxTeamId,
        name: parsedInput.name,
        workspaceId,
      })

      if (parsedInput.userIds.length > 0) {
        await tx.insert(inboxTeamMemberModel).values(
          parsedInput.userIds.map((userId) => ({
            id: createId(),
            userId,
            workspaceId,
            inboxTeamId,
          })),
        )
      }
    })

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
