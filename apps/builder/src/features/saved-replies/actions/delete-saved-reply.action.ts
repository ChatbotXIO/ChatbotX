"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteSavedReplyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx: { user },
    } = props

    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: {
        id,
        workspaceId,
      },
      message: "Resposta salva não encontrada",
    })

    await db
      .delete(savedReplyModel)
      .where(eq(savedReplyModel.id, savedReply.id))

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.SNIPPET_DELETED,
      detail: `Trecho "${savedReply.shortcut}" excluído`,
    })
  })
