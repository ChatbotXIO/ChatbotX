"use server"

import { integrationMailchimpService } from "@chatbotx.io/business"
import { createMailchimpAuth } from "@chatbotx.io/integration-mailchimp"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMailchimpSchema } from "../schema"

export const connectMailchimpAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectMailchimpSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      await integrations.mailchimp.runAction("validateApiKey", {
        props: { apiKey: parsedInput.apiKey },
      })

      await integrationMailchimpService.upsert({
        workspaceId,
        auth: createMailchimpAuth(parsedInput.apiKey),
      })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Mailchimp",
      )
      throw error
    }
  })
