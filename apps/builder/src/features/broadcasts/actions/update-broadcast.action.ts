"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { broadcastModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateBroadcastSchema,
  updateBroadcastSchema,
} from "../schema/action"

export const updateBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateBroadcastSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateBroadcast({ workspaceId, id }, parsedInput)
  })

export const updateBroadcast = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateBroadcastSchema,
) => {
  const broadcast = await findOrFail({
    table: broadcastModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
      deletedAt: { isNull: true },
    },
  })

  await db
    .update(broadcastModel)
    .set(parsedInput)
    .where(eq(broadcastModel.id, broadcast.id))

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "update",
    detail: `updated a broadcast (#${broadcast.id})`,
  })
}
