"use server"

import { connectionService } from "@chatbotx.io/connections"
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
      // `allowUpdate: true` mirrors the legacy `integrationMoosendService.upsert`
      // this replaces — that always upserted (replacing an already-connected
      // workspace's stored API key), never rejecting a repeat connect.
      await connectionService.connectFromCredentials({
        workspaceId,
        provider: "moosend",
        config: parsedInput,
        allowUpdate: true,
      })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect Moosend",
      )
      throw error
    }
  })
