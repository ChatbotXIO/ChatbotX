"use server"

import { qrCodeService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateQrCodeRequest } from "../schema/action"

export const updateQrCodeAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateQrCodeRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const t = await getTranslations()
    try {
      await qrCodeService.update({
        workspaceId,
        id,
        data: parsedInput,
        duplicateNameMessage: t("messages.nameAlreadyExists", {
          feature: t("fields.qrCode.label"),
        }),
      })
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "validation") {
        return returnValidationErrors(updateQrCodeRequest, {
          name: {
            _errors: [error.message],
          },
        })
      }

      throw error
    }
  })
