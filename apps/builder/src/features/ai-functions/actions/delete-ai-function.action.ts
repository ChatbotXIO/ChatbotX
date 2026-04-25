"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { notFoundException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiFunctionService } from "../ai-function.service"

export const deleteAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action((props) => {
    const {
      bindArgsParsedInputs: [workspaceId, aiFunctionId],
    } = props

    return deleteAIFunction({ workspaceId, aiFunctionId })
  })

export const deleteAIFunction = async (ctx: {
  workspaceId: string
  aiFunctionId: string
}) => {
  const t = await getTranslations()

  const aiFunction = await aiFunctionService.findBy({
    where: {
      id: ctx.aiFunctionId,
      workspaceId: ctx.workspaceId,
    },
  })

  if (!aiFunction) {
    throw notFoundException(
      t("messages.featureNotFound", { feature: "AIFunction" }),
    )
  }

  await aiFunctionService.delete(ctx.aiFunctionId)

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiFunctions`)
}
