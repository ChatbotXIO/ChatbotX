"use server"

import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTeamMembersAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsClientInputs: [workspaceId, inboxTeamId],
      parsedInput,
    } = props

    return await deleteInboxTeamMember(
      { workspaceId, inboxTeamId },
      parsedInput,
    )
  })

export const deleteInboxTeamMember = async (
  ctx: { workspaceId: string; inboxTeamId: string },
  parsedInput: BulkUpdateIdsRequest,
) => {
  const inboxTeam = await findOrFail({
    table: inboxTeamModel,
    where: {
      id: ctx.inboxTeamId,
      workspaceId: ctx.workspaceId,
    },
    message: "Inbox team not found",
  })

  await db
    .delete(inboxTeamMemberModel)
    .where(
      and(
        eq(inboxTeamMemberModel.inboxTeamId, inboxTeam.id),
        inArray(inboxTeamMemberModel.id, parsedInput.ids),
      ),
    )

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#inboxTeams`)
}
