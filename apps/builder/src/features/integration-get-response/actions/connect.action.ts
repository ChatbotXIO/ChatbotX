"use server"

import { integrationGetResponseService } from "@chatbotx.io/business"
import {
  GetResponseApiError,
  integration as getResponseIntegration,
} from "@chatbotx.io/integration-get-response"
import { SdkException } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectGetResponseSchema } from "../schema"

export const connectGetResponseAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectGetResponseSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await getResponseIntegration.runAction(
        "validateCredentials",
        { props: parsedInput },
      )
      await integrationGetResponseService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect GetResponse",
      )
      if (error instanceof GetResponseApiError) {
        const t = await getTranslations("getResponse.errors")
        throw new SdkException(t("invalidApiKey"), 400, 400)
      }
      throw error
    }
  })
