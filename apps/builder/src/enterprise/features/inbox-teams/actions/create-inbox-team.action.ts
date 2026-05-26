"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
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
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
    } = props

    const inboxTeamId = createId()

    await db.transaction(async (tx) => {
      await tx.insert(inboxTeamModel).values({
        id: inboxTeamId,
        name: parsedInput.name,
        description: parsedInput.description ?? null,
        workspaceId,
      })

      if (parsedInput.userIds.length > 0) {
        await tx.insert(inboxTeamMemberModel).values(
          parsedInput.userIds.map((userId) => ({
            id: createId(),
            userId,
            inboxTeamId,
          })),
        )
      }
    })

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.TEAM_CREATED,
      detail: `Equipe "${parsedInput.name}" criada com ${parsedInput.userIds.length} membro(s)`,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
