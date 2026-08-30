"use server"

import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { buildMessagingAdsConnectRedirect } from "./connect-redirect"
import { connectMessagingAdsRequest } from "./schema"

const CHANNEL_ROUTE_SEGMENT: Record<MessagingAdChannel, string> = {
  whatsapp: "whatsapps",
  messenger: "messengers",
  instagram: "instagrams",
}

function refererPathFor(
  channel: MessagingAdChannel,
  workspaceId: string,
  integrationId: string,
): string {
  return `/space/${workspaceId}/${CHANNEL_ROUTE_SEGMENT[channel]}/${integrationId}/ads`
}

/** `bindArgsParsedInputs`: `[workspaceId, integrationId]` — `channel` is a regular action input since it isn't part of the URL the box lives on. */
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
        refererPath: refererPathFor(
          parsedInput.channel,
          workspaceId,
          integrationId,
        ),
      })
    },
  )
