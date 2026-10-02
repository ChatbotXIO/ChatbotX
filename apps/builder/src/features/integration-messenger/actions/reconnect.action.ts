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
import { FACEBOOK_SSO_SCOPES } from "@/lib/auth/upgrade-facebook-account"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
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

      const redirectUrl = await buildProviderCallbackUrl(
        messengerCredential,
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
        // Same override-aware list the initial connect uses (libs/oauth.ts):
        // without it the reconnect fell back to the classic MESSENGER_SCOPES
        // and a Facebook Login for Business app answered "Invalid Scopes:
        // email, pages_manage_posts, page_events" (fork, s171).
        scopes: FACEBOOK_SSO_SCOPES,
      })

      return redirect(authUrl)
    },
  )
