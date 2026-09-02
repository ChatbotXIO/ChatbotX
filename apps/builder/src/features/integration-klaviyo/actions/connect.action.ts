"use server"

import { integrationKlaviyoService } from "@chatbotx.io/business"
import {
  KlaviyoApiError,
  integration as klaviyoIntegration,
} from "@chatbotx.io/integration-klaviyo"
import { SdkException } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectKlaviyoSchema } from "../schema"

export const connectKlaviyoAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectKlaviyoSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await klaviyoIntegration.runAction("validateCredentials", {
        props: parsedInput,
      })
      await integrationKlaviyoService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Klaviyo",
      )
      if (
        error instanceof KlaviyoApiError &&
        (error.statusCode === 401 || error.statusCode === 403)
      ) {
        const t = await getTranslations("klaviyo.errors")
        throw new SdkException(t("invalidApiKey"), 400, 400)
      }
      throw error
    }
  })
