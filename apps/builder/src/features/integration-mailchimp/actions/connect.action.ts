"use server"

import { connectionService } from "@chatbotx.io/connections"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMailchimpSchema } from "../schema"

export const connectMailchimpAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectMailchimpSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      // `allowUpdate: true` mirrors the legacy
      // `integrationMailchimpService.upsert` this replaces — that always
      // upserted (replacing an already-connected workspace's stored API
      // key), never rejecting a repeat connect.
      await connectionService.connectFromCredentials({
        workspaceId,
        provider: "mailchimp",
        config: parsedInput,
        allowUpdate: true,
      })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Mailchimp",
      )
      throw error
    }
  })
