"use server"

import { integrationDripService } from "@chatbotx.io/business"
import {
  DripNoAccountError,
  integration as dripIntegration,
} from "@chatbotx.io/integration-drip"
import { SdkException } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectDripSchema } from "../schema"

export const connectDripAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectDripSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const auth = await dripIntegration.runAction("validateCredentials", {
        props: parsedInput,
      })
      await integrationDripService.upsert({ workspaceId, auth })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Drip",
      )
      if (error instanceof DripNoAccountError) {
        const t = await getTranslations("drip.errors")
        throw new SdkException(t("noAccount"), 400, 400)
      }
      throw error
    }
  })
