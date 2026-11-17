"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { minigameService } from "@chatbotx.io/business/minigame"
import { getTranslations } from "next-intl/server"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateMinigameAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    try {
      const minigame = await minigameService.duplicate({ workspaceId, id })
      return { id: minigame.id }
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "nameAlreadyExists"
      ) {
        const t = await getTranslations()
        // Re-thrown with the translated text: `handleServerError` passes a
        // ChatbotXException's message straight to the dialog's toast.
        throw new ChatbotXException(
          t("messages.nameAlreadyExists", {
            feature: t("fields.minigame.label"),
          }),
          error.code,
          error.httpStatusCode,
        )
      }
      throw error
    }
  })
