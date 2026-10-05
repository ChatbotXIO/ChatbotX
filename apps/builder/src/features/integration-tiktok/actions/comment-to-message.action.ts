"use server"

import { tiktokIntegrationService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Turns TikTok's Comment-to-Message on or off for one connected account. The
 * TikTok call, status cache and audit live in
 * `tiktokIntegrationService.setCommentToMessage`, shared with the public API.
 */
export const toggleTiktokCommentToMessageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(z.object({ enabled: z.boolean() }))
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput: { enabled },
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      parsedInput: { enabled: boolean }
    }) => ({
      status: await tiktokIntegrationService.setCommentToMessage({
        workspaceId,
        id,
        enabled,
      }),
    }),
  )

/** Re-reads the setting from TikTok and re-caches it. */
export const refreshTiktokCommentToMessageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => ({
      status: await tiktokIntegrationService.refreshCommentToMessage({
        workspaceId,
        id,
      }),
    }),
  )
