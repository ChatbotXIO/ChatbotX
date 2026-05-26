"use server"

import {
  auditLogActions,
  botFieldService,
  logAudit,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteBotFieldsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    } = props

    const names = await db.query.botFieldModel.findMany({
      columns: { name: true },
      where: { workspaceId, id: { in: parsedInput.ids } },
    })

    await botFieldService.bulkDelete({ workspaceId, ids: parsedInput.ids })

    if (names.length > 0) {
      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.BOT_FIELD_DELETED,
        detail: `Campo(s) do bot excluído(s): ${names.map((f) => `"${f.name}"`).join(", ")}`,
      })
    }
  })
