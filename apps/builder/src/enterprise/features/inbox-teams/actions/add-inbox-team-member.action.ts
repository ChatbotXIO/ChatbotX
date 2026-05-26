"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { addInboxTeamMemberRequest } from "../schema/action"

export const addInboxTeamMemberAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(addInboxTeamMemberRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, inboxTeamId],
      ctx: { user },
      parsedInput,
    } = props

    const inboxTeam = await findOrFail({
      table: inboxTeamModel,
      where: {
        id: inboxTeamId,
        workspaceId,
      },
      message: "Inbox team not found",
    })

    let newUserIds: string[] = []
    await db.transaction(async (tx) => {
      const existingMembers = await tx.query.inboxTeamMemberModel.findMany({
        where: {
          userId: { in: parsedInput.userIds },
          inboxTeamId: inboxTeam.id,
        },
        columns: { userId: true },
      })
      const existingUserIds = new Set(existingMembers.map((m) => m.userId))
      newUserIds = parsedInput.userIds.filter(
        (uid) => !existingUserIds.has(uid),
      )

      if (newUserIds.length > 0) {
        await tx.insert(inboxTeamMemberModel).values(
          newUserIds.map((userId) => ({
            id: createId(),
            userId,
            inboxTeamId: inboxTeam.id,
          })),
        )
      }
    })

    if (newUserIds.length > 0) {
      const addedUsers = await db.query.userModel.findMany({
        where: { id: { in: newUserIds } },
        columns: { name: true },
      })
      const names = addedUsers
        .map((u) => u.name)
        .filter(Boolean)
        .join(", ")
      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.TEAM_MEMBER_ADDED,
        detail: `${addedUsers.length} membro(s) adicionado(s) à equipe "${inboxTeam.name}"${
          names ? `: ${names}` : ""
        }`,
      })
    }

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
