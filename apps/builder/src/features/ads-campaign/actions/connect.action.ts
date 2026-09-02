"use server"

import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { buildMessagingAdsToolPath } from "../lib/tool-path"
import { buildMessagingAdsConnectRedirect } from "./connect-redirect"
import { connectMessagingAdsRequest } from "./schema"

/**
 * `bindArgsParsedInputs`: `[workspaceId, integrationId]` — `channel` stays a
 * regular action input even though the Click to Message Ads tool page now
 * encodes it in the URL (`buildMessagingAdsToolPath`), because the bound
 * args are fixed to `[workspaceId, integrationId]` and can't grow a third
 * positional value. The referer built below targets that same tool page +
 * channel + integration, so Meta's OAuth round-trip lands the user back on
 * the exact tab and integration they clicked Connect from.
 */
export const connectMessagingAdsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(connectMessagingAdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: [string, string]
      parsedInput: { channel: MessagingAdChannel }
      ctx: {
        user: UserModel
        workspace: WorkspaceModel
      }
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      return buildMessagingAdsConnectRedirect({
        workspace: ctx.workspace,
        channel: parsedInput.channel,
        integrationId,
        refererPath: buildMessagingAdsToolPath({
          workspaceId,
          channel: parsedInput.channel,
          integrationId,
        }),
      })
    },
  )
