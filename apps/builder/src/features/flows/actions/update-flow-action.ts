"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { flowModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { type UpdateFlowSchema, updateFlowSchema } from "../schemas/action"

export const updateFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateFlowSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await updateFlow({ workspaceId, id }, parsedInput)
  })

const updateFlow = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateFlowSchema,
) => {
  const flow = await findOrFail({
    table: flowModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Flow not found",
  })

  await db.update(flowModel).set(parsedInput).where(eq(flowModel.id, flow.id))

  revalidateCacheTags(`workspaces:${flow.workspaceId}#flows`)
}
