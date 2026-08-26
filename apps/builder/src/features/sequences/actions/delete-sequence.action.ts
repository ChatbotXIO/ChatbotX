"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { sequenceModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
  const sequence = await findOrFail({
    table: sequenceModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Sequence not found",
  })

  await db.delete(sequenceModel).where(and(eq(sequenceModel.id, ctx.id)))

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "delete",
    detail: `deleted a sequence (#${sequence.id})`,
  })
}
