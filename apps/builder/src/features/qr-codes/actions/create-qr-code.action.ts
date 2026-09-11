"use server"

import { qrCodeService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { type CreateQrCodeRequest, createQrCodeRequest } from "../schema/action"

export const createQrCodeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createQrCodeRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateQrCodeRequest
    }) => {
      const t = await getTranslations()
      try {
        return await qrCodeService.create({
          workspaceId,
          data: parsedInput,
          duplicateNameMessage: t("messages.nameAlreadyExists", {
            feature: t("fields.qrCode.label"),
          }),
        })
      } catch (error) {
        if (error instanceof ChatbotXException && error.code === "validation") {
          return returnValidationErrors(createQrCodeRequest, {
            name: {
              _errors: [error.message],
            },
          })
        }

        throw error
      }
    },
  )
