"use server"

import { minigameService } from "@chatbotx.io/business/minigame"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateMinigameRequest,
  createMinigameRequest,
} from "../schemas/action"

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
        if (isUniqueViolationError(error)) {
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
