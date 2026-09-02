"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteFbCommentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await deleteFbComment({ workspaceId, id })
  })

export const deleteFbComment = async (ctx: {
  workspaceId: string
  id: string
}) => {
  await findOrFail({
    table: fbCommentAutomationModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "FB Comment Automation not found",
  })

  await fbCommentAutomationService.deleteMany({
    workspaceId: ctx.workspaceId,
    ids: [ctx.id],
  })
}
