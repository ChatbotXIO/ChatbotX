"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingModel, aiFileModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAIFileAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    return await deleteAIFile({ workspaceId, id })
  })

export const deleteAIFile = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const targetAIFile = await findOrFail({
    table: aiFileModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: `AIFile with id ${ctx.id} not found`,
  })

  try {
    await db.transaction(async (tx) => {
      await uploader.deleteObject(targetAIFile.path)
      await tx.delete(aiEmbeddingModel).where(eq(aiEmbeddingModel.id, ctx.id))
      await tx.delete(aiFileModel).where(eq(aiFileModel.id, ctx.id))
    })

    revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiFiles`)
  } catch (error) {
    logger.warn(error, `deleteAIFileAction failed for id: ${ctx.id}`)
  }
}
