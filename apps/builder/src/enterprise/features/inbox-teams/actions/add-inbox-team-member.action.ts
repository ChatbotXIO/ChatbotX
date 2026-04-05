"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type AddInboxTeamMemberRequest,
  addInboxTeamMemberRequest,
} from "../schema/action"

export const addInboxTeamMemberAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(addInboxTeamMemberRequest)
  .action(async (props) => {
    const {
      bindArgsClientInputs: [workspaceId, inboxTeamId],
      parsedInput,
    } = props

    return await addInboxTeamMember({ workspaceId, inboxTeamId }, parsedInput)
  })

export const addInboxTeamMember = async (
  ctx: { workspaceId: string; inboxTeamId: string; userId?: string },
  parsedInput: AddInboxTeamMemberRequest,
) => {
  const inboxTeam = await findOrFail({
    table: inboxTeamModel,
    where: {
      id: ctx.inboxTeamId,
      workspaceId: ctx.workspaceId,
    },
    message: "Inbox team not found",
  })

  await db.transaction(async (tx) => {
    const existingMembers = await tx.query.inboxTeamMemberModel.findMany({
      where: {
        userId: {
          in: parsedInput.userIds,
        },
        inboxTeamId: inboxTeam.id,
      },
      columns: {
        userId: true,
      },
    })

    const existingUserIds = new Set(
      existingMembers.map((member) => member.userId),
    )

    const newUserIds = parsedInput.userIds.filter(
      (userId) => !existingUserIds.has(userId),
    )

    if (newUserIds.length > 0) {
      await tx.insert(inboxTeamMemberModel).values(
        newUserIds.map((userId) => ({
          id: createId(),
          userId,
          workspaceId: ctx.workspaceId,
          inboxTeamId: ctx.inboxTeamId,
        })),
      )
    }
  })

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#inboxTeams`)
}
