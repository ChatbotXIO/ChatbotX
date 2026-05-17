"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiFunctionService } from "../ai-function.service"
import {
  type UpdateAIFunctionRequest,
  updateAIFunctionRequest,
} from "../schemas/action"

export const updateAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIFunctionRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const t = await getTranslations()

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

    return await updateAIFunction({ workspaceId, id }, parsedInput, t)
  })

export const updateAIFunction = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAIFunctionRequest,
  t?: Awaited<ReturnType<typeof getTranslations>>,
) => {
  const translations = t ?? (await getTranslations())

  const aiFunction = await aiFunctionService.findBy({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
  })

  if (!aiFunction) {
    throw notFoundException(
      translations("messages.featureNotFound", {
        feature: translations("fields.aiFunction.label"),
      }),
    )
  }

  await aiFunctionService.update(ctx.id, parsedInput)

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiFunctions`)
}
