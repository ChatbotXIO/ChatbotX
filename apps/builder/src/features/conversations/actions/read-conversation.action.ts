"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const readConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
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
