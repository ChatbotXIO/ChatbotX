"use server"

import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteIgCommentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await deleteIgComment({ workspaceId, id })
  })

export const deleteIgComment = async (ctx: {
  workspaceId: string
  id: string
}) => {
  await findOrFail({
    table: fbCommentAutomationModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Instagram Comment Automation not found",
  })

  await db
    .delete(fbCommentAutomationModel)
    .where(and(eq(fbCommentAutomationModel.id, ctx.id)))
}
