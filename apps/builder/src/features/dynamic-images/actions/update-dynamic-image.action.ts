"use server"

import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateDynamicImageRequest,
  updateDynamicImageRequest,
} from "../schemas/action"

export const updateDynamicImageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateDynamicImageRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateDynamicImageRequest
    }) => {
      const t = await getTranslations()

      try {
        await dynamicImageService.update({ workspaceId, id, ...parsedInput })
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(updateDynamicImageRequest, {
            name: {
              _errors: [
                t("messages.nameAlreadyExists", {
                  feature: t("fields.dynamicImage.label"),
                }),
              ],
            },
          })
        }

        throw error
      }
    },
  )
