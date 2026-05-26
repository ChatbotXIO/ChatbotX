"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { bulkUpdateIdsRequest } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTeamMembersAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(bulkUpdateIdsRequest)
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

    const removed = await db.query.inboxTeamMemberModel.findMany({
      where: {
        inboxTeamId: inboxTeam.id,
        id: { in: parsedInput.ids },
      },
      with: { user: { columns: { name: true } } },
    })

    await db
      .delete(inboxTeamMemberModel)
      .where(
        and(
          eq(inboxTeamMemberModel.inboxTeamId, inboxTeam.id),
          inArray(inboxTeamMemberModel.id, parsedInput.ids),
        ),
      )

    const names = removed
      .map((m) => m.user?.name)
      .filter(Boolean)
      .join(", ")
    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.TEAM_MEMBER_REMOVED,
      detail: `${removed.length} membro(s) removido(s) da equipe "${inboxTeam.name}"${
        names ? `: ${names}` : ""
      }`,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
