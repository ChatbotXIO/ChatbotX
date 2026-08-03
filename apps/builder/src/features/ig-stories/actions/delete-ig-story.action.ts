"use server"

import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteIgStoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await deleteIgStory({ workspaceId, id })
  })

export const deleteIgStory = async (ctx: {
  workspaceId: string
  id: string
}) => {
  await findOrFail({
    table: igStoryAutomationModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Instagram Story Automation not found",
  })

  await db
    .delete(igStoryAutomationModel)
    .where(and(eq(igStoryAutomationModel.id, ctx.id)))
}
