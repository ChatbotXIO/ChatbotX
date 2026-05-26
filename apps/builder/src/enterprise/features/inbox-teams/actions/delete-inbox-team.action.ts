"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { inboxTeamModel } from "@chatbotx.io/database/schema"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteInboxTeamAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      parsedInput,
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
    } = props

    const teamsToDelete = await db.query.inboxTeamModel.findMany({
      where: {
        workspaceId,
        id: { in: parsedInput.ids },
      },
      columns: { name: true },
    })

    await db
      .delete(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          inArray(inboxTeamModel.id, parsedInput.ids),
        ),
      )

    const names = teamsToDelete.map((t) => `"${t.name}"`).join(", ")
    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.TEAM_DELETED,
      detail: `Equipe(s) excluída(s): ${names || "(nenhuma)"}`,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
