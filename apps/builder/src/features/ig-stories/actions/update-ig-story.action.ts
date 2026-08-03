"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateIgStoryRequest,
  updateIgStoryRequest,
} from "../schema/action"

export const updateIgStory = async (
  ctx: { workspaceId: string; id: string },
  input: UpdateIgStoryRequest,
) => {
  const [record] = await db
    .update(igStoryAutomationModel)
    .set(input)
    .where(
      and(
        eq(igStoryAutomationModel.id, ctx.id),
        eq(igStoryAutomationModel.workspaceId, ctx.workspaceId),
      ),
    )
    .returning()

  return record
}

export const updateIgStoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateIgStoryRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateIgStoryRequest
    }) => {
      await updateIgStory({ workspaceId, id }, parsedInput)
    },
  )
