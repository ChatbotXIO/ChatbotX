"use server"

import { integrationMoosendService } from "@chatbotx.io/business"
import {
  MoosendApiError,
  integration as moosendIntegration,
} from "@chatbotx.io/integration-moosend"
import { SdkException } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMoosendSchema } from "../schema"

export const connectMoosendAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectMoosendSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await moosendIntegration.runAction("validateCredentials", {
        props: parsedInput,
      })
      await integrationMoosendService.upsert({ workspaceId, auth })
    } catch (error) {
      const t = await getTranslations("moosend.errors")
      if (error instanceof MoosendApiError) {
        logger.error(
          {
            err: normalizeError(error),
            kind: error.kind,
            statusCode: error.statusCode,
            workspaceId,
          },
          "Failed to connect Moosend",
        )
        if (error.kind === "invalid_credentials") {
          throw new SdkException(t("invalidApiKey"), 400, 400)
        }
        if (error.kind === "user_not_enabled") {
          throw new SdkException(t("userNotEnabled"), 400, 400)
        }
        throw new SdkException(t("connectFailed"), 502, 502)
      }
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Moosend",
      )
      throw error
    }
  })
