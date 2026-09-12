"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { minigameService } from "@chatbotx.io/business/minigame"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateMinigameRequest,
  updateMinigameRequest,
} from "../schema/action"

const originalPrizeQuantitiesSchema = z.record(
  z.string(),
  z.number().int().min(0).optional(),
)

export const updateMinigameAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    originalPrizeQuantitiesSchema.default({}),
  ])
  .inputSchema(updateMinigameRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id, originalPrizeQuantities],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [
        string,
        string,
        Record<string, number | undefined>,
      ]
      parsedInput: UpdateMinigameRequest
    }) => {
      const t = await getTranslations()

      try {
        await minigameService.update({
          workspaceId,
          id,
          originalPrizeQuantities,
          ...parsedInput,
        })
      } catch (error) {
        if (
          error instanceof ChatbotXException &&
          error.code === "nameAlreadyExists"
        ) {
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
