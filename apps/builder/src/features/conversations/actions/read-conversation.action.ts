"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

// bindArgsSchemas usa array exportado de common/schemas (não inline) pra
// evitar quirk Next 16 standalone. Documentado em
// memory/reference_next16_standalone_use_server_quirk.md.
export const readConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await readConversation({ workspaceId, id })
  })

export const readConversation = async (ctx: {
  workspaceId: string
  id: string
}) => {
  await db
    .update(conversationModel)
    .set({
      agentLastReadAt: new Date(),
    })
    .where(
      and(
        eq(conversationModel.id, ctx.id),
        eq(conversationModel.workspaceId, ctx.workspaceId),
      ),
    )
}
