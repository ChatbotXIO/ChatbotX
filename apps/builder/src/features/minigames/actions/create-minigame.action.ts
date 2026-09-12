"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { minigameService } from "@chatbotx.io/business/minigame"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateMinigameRequest,
  createMinigameRequest,
} from "../schema/action"

export const createMinigameAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMinigameRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateMinigameRequest
    }) => {
      const t = await getTranslations()

      try {
        const minigame = await minigameService.create({
          workspaceId,
          ...parsedInput,
        })
        return { id: minigame.id }
      } catch (error) {
        if (
          error instanceof ChatbotXException &&
          error.code === "nameAlreadyExists"
        ) {
          return returnValidationErrors(createMinigameRequest, {
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
