"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { notFoundException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiFunctionService } from "../ai-function.service"
import {
  type UpdateAIFunctionRequest,
  updateAIFunctionRequest,
} from "../schema/action"

export const updateAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIFunctionRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const t = await getTranslations()

    if (parsedInput.name) {
      const existing = await aiFunctionService.findBy({
        where: {
          workspaceId,
          name: parsedInput.name,
        },
      })

      if (existing && existing.id !== id) {
        return returnValidationErrors(updateAIFunctionRequest, {
          name: {
            _errors: [
              t("messages.nameAlreadyExists", {
                feature: t("fields.aiFunction.label"),
              }),
            ],
          },
        })
      }
    }

    return await updateAIFunction({ workspaceId, id }, parsedInput)
  })

export const updateAIFunction = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAIFunctionRequest,
) => {
  const t = await getTranslations()

  const aiFunction = await aiFunctionService.findBy({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
  })

  if (!aiFunction) {
    throw notFoundException(
      t("messages.featureNotFound", { feature: "AIFunction" }),
    )
  }

  await aiFunctionService.update(ctx.id, parsedInput)

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiFunctions`)
}
