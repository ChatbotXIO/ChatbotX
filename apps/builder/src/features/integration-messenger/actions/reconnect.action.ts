"use server"

import {
  messengerIntegrationService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateAuthUrl } from "@chatbotx.io/integration-messenger"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Start an OAuth reconnect for an existing Messenger integration: send the
 * user back through the Facebook dialog with `reconnectIntegrationId` in the
 * OAuth state so the callback refreshes this row's tokens instead of running
 * the page-select connect flow. Mirrors `connectFacebookAds`.
 */
export const reconnectMessengerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      ctx,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      ctx: { workspace: WorkspaceModel }
    }) => {
      const integrationMessenger =
        await messengerIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integrationMessenger) {
        throw new ChatbotXException("Integration Messenger not found")
      }

      const messengerCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(ctx.workspace),
          type: "messenger",
        })
      if (!messengerCredential) {
        throw new ChatbotXException("Messenger App settings not found")
      }

      const redirectUrl = buildBrokerCallbackUrl(
        "/integrations/messenger/callback",
      )
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${workspaceId}/settings/channels?channel=messenger`,
        baseUrl,
      ).toString()

      const authUrl = generateAuthUrl({
        clientId: messengerCredential.config.clientId,
        version: messengerCredential.config.version,
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
