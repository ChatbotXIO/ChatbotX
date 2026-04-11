"use server"

import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

const enableRequest = z.object({
  status: z.boolean(),
})
type EnableRequest = z.infer<typeof enableRequest>

export const enableAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(enableRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await enableAutomatedResponse({ workspaceId, id }, parsedInput)
  })

export const enableAutomatedResponse = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: EnableRequest,
) => {
  const automatedResponse = await findOrFail({
    table: automatedResponseModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Automated response not found",
  })
  await db
    .update(automatedResponseModel)
    .set({
      status: parsedInput.status,
    })
    .where(eq(automatedResponseModel.id, automatedResponse.id))

  await automatedResponseService.invalidateCache(ctx.workspaceId)

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#automatedResponses`)
}
