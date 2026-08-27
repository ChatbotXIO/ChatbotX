"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { flowModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
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

  const hasChanges = Object.entries(parsedInput).some(
    ([key, value]) => flow[key as keyof UpdateFlowSchema] !== value,
  )

  if (!hasChanges) {
    return
  }

  const updated = await db
    .update(flowModel)
    .set(parsedInput)
    .where(eq(flowModel.id, flow.id))
    .returning({ id: flowModel.id })

  if (updated.length === 0) {
    return
  }

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "update",
    detail: `updated a flow (#${flow.id})`,
  })
}
