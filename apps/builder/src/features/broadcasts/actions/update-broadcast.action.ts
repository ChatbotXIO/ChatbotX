"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { broadcastModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateBroadcastSchema,
  updateBroadcastSchema,
} from "../schemas/action"

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
    },
  })

  await db
    .update(broadcastModel)
    .set(parsedInput)
    .where(eq(broadcastModel.id, broadcast.id))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#broadcasts`)
}
