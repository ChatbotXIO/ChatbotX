"use server"

import { integrationSendGridService } from "@chatbotx.io/business"
import {
  SendGridApiError,
  SendGridMissingScopesError,
  integration as sendGridIntegration,
} from "@chatbotx.io/integration-sendgrid"
import { SdkException } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectSendGridSchema } from "../schema"

export const connectSendGridAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectSendGridSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await sendGridIntegration.runAction("validateCredentials", {
        props: parsedInput,
      })
      await integrationSendGridService.upsert({ workspaceId, auth })
    } catch (error) {
      if (error instanceof SendGridMissingScopesError) {
        const t = await getTranslations("sendGrid.errors")
        throw new SdkException(t("missingScopes"), 400, 400)
      }
      if (
        error instanceof SendGridApiError &&
        (error.statusCode === 401 || error.statusCode === 403)
      ) {
        const t = await getTranslations("sendGrid.errors")
        throw new SdkException(t("invalidApiKey"), 400, 400)
      }
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect SendGrid",
      )
      throw error
    }
  })
