"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  type UpdateAITriggerRequest,
  updateAITriggerRequest,
} from "@/features/ai-triggers/schemas/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const updateAITriggerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAITriggerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateAITrigger({ workspaceId, id }, parsedInput)
  })

export const updateAITrigger = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAITriggerRequest,
) => {
  const aiTrigger = await findOrFail({
    table: aiTriggerModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "AITrigger not found",
  })

  await db
    .update(aiTriggerModel)
    .set(parsedInput)
    .where(eq(aiTriggerModel.id, aiTrigger.id))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiTriggers`)
}
