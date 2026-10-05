"use server"

import { connectionService } from "@chatbotx.io/connections"
import { normalizeError } from "universal-error-normalizer"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectActiveCampaignSchema } from "../schema"

export const connectActiveCampaignAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectActiveCampaignSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      // `allowUpdate: true` mirrors the legacy
      // `integrationActiveCampaignService.upsert` this replaces — that always
      // upserted (replacing an already-connected workspace's stored
      // credentials), never rejecting a repeat connect.
      await connectionService.connectFromCredentials({
        workspaceId,
        provider: "activeCampaign",
        config: parsedInput,
        allowUpdate: true,
      })
    } catch (error) {
      logger.error(
        { err: normalizeError(error), workspaceId },
        "Failed to connect ActiveCampaign",
      )
      throw error
    }
  })
