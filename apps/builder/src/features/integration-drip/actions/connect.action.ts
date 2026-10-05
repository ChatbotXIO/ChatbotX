"use server"

import { connectionService } from "@chatbotx.io/connections"
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
      // `allowUpdate: true` mirrors the legacy `integrationDripService.upsert`
      // this replaces — that always upserted (replacing an already-connected
      // workspace's stored API token), never rejecting a repeat connect.
      await connectionService.connectFromCredentials({
        workspaceId,
        provider: "drip",
        config: parsedInput,
        allowUpdate: true,
      })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Drip",
      )
      throw error
    }
  })
