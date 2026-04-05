"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateAITriggerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    return await duplicateAITrigger({ workspaceId, id })
  })

export const duplicateAITrigger = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const targetAITrigger = await findOrFail({
    table: aiTriggerModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "AITrigger not found",
  })
  const { id: eid, name, createdAt, updatedAt, ...rest } = targetAITrigger

  await db.insert(aiTriggerModel).values({
    ...rest,
    name: `${name} _copy`,
  })

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiTriggers`)
}
