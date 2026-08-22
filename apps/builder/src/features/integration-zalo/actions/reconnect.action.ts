"use server"

import {
  platformCredentialService,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Start an OAuth reconnect for an existing Zalo OA integration: send the user
 * back through the Zalo permission dialog with `reconnectIntegrationId` in the
 * OAuth state so the callback refreshes this row's tokens instead of running
 * the connect flow. Mirrors `reconnectMessengerAction`.
 */
export const reconnectZaloAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      ctx,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      ctx: { workspace: WorkspaceModel }
    }) => {
      // Throws when the integration does not belong to this workspace.
      await zaloIntegrationService.findById({
        id: integrationId,
        workspaceId,
      })

      const zaloCredential = await platformCredentialService.resolveForOwner({
        ownerId: await resolveOwnerForWorkspace(ctx.workspace),
        type: "zalo",
      })
      if (!zaloCredential) {
        throw new ChatbotXException("Zalo App settings not found")
      }

      const redirectUrl = buildBrokerCallbackUrl("/integrations/zalo/callback")
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${workspaceId}/settings/channels?channel=zalo`,
        baseUrl,
      ).toString()

      const authUrl = generateAuthUrl({
        clientId: zaloCredential.config.clientId,
        // The authorize URL only carries the app id; the secret is used later
        // by the callback's token exchange, never in the browser redirect.
        clientSecret: "",
        redirectUrl,
        stateParams: {
          workspaceId,
          referer,
          reconnectIntegrationId: integrationId,
        },
      })

      return redirect(authUrl)
    },
  )
