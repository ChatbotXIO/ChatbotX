"use server"

import { integrationMailerLiteService } from "@chatbotx.io/business"
import {
  MailerLiteApiError,
  integration as mailerLiteIntegration,
} from "@chatbotx.io/integration-mailer-lite"
import { SdkException } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMailerLiteSchema } from "../schema"

export const connectMailerLiteAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectMailerLiteSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await mailerLiteIntegration.runAction(
        "validateCredentials",
        { props: parsedInput },
      )
      await integrationMailerLiteService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect MailerLite",
      )
      if (
        error instanceof MailerLiteApiError &&
        (error.statusCode === 401 || error.statusCode === 403)
      ) {
        const t = await getTranslations("mailerLite.errors")
        throw new SdkException(t("invalidApiKey"), 400, 400)
      }
      throw error
    }
  })
