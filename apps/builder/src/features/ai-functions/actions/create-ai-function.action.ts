"use server"

import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiFunctionService } from "../ai-function.service"
import { createAIFunctionRequest } from "../schemas/action"

export const createAIFunctionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    const t = await getTranslations()

    const existing = await aiFunctionService.findBy({
      where: {
        workspaceId,
        name: parsedInput.name,
      },
    })

    if (existing) {
      return returnValidationErrors(createAIFunctionRequest, {
        name: {
          _errors: [
            t("messages.nameAlreadyExists", {
              feature: t("fields.aiFunction.label"),
            }),
          ],
        },
      })
    }

    await aiFunctionService.create(workspaceId, parsedInput)

    revalidateCacheTags(`workspaces:${workspaceId}#aiFunctions`)
  })
