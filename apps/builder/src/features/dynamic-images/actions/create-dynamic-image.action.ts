"use server"

import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateDynamicImageRequest,
  createDynamicImageRequest,
} from "../schemas/action"

export const createDynamicImageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createDynamicImageRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateDynamicImageRequest
    }) => {
      const t = await getTranslations()

      try {
        const dynamicImage = await dynamicImageService.create({
          workspaceId,
          ...parsedInput,
        })
        return { id: dynamicImage.id }
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(createDynamicImageRequest, {
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
