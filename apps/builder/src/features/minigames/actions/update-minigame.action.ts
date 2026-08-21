"use server"

import { minigameService } from "@chatbotx.io/business/minigame"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateMinigameRequest,
  updateMinigameRequest,
} from "../schemas/action"

export const updateMinigameAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateMinigameRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateMinigameRequest
    }) => {
      const t = await getTranslations()

      try {
        await minigameService.update({ workspaceId, id, ...parsedInput })
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(updateMinigameRequest, {
            generalSettings: {
              name: {
                _errors: [
                  t("messages.nameAlreadyExists", {
                    feature: t("fields.minigame.label"),
                  }),
                ],
              },
            },
          })
        }

        throw error
      }
    },
  )
