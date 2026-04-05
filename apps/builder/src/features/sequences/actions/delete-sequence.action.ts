"use server"

import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { sequenceModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteSequenceAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await deleteSequence({ workspaceId, id })
  })

export const deleteSequence = async (ctx: {
  workspaceId: string
  id: string
}) => {
  await findOrFail({
    table: sequenceModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Sequence not found",
  })

  await db.delete(sequenceModel).where(and(eq(sequenceModel.id, ctx.id)))

  revalidateCacheTags([`workspaces:${ctx.workspaceId}#sequences`])
}
