"use server"

import {
  instagramIntegrationService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateAuthUrl as generateInstagramAuthUrl } from "@chatbotx.io/integration-instagram"
import { generateAuthUrl as generateInstagramFacebookAuthUrl } from "@chatbotx.io/integration-instagram-facebook"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import {
  buildReconnectReferer,
  type ReconnectReturnTo,
  reconnectReturnToSchema,
} from "@/lib/channel-reconnect"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Start an OAuth reconnect for an existing Instagram integration. The row's
 * `type` decides which OAuth dialog to open: the direct Instagram login or the
 * Facebook login. `reconnectIntegrationId` in the OAuth state makes the
 * callback refresh this row's tokens instead of running the account-select
 * connect flow. Mirrors `connectFacebookAds`.
 */
export const reconnectInstagramAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    reconnectReturnToSchema.optional(),
  ])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId, returnTo],
      ctx,
    }: {
      bindArgsParsedInputs: readonly [
        string,
        string,
        ReconnectReturnTo | undefined,
      ]
      ctx: { workspace: WorkspaceModel }
    }) => {
      const integrationInstagram =
        await instagramIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integrationInstagram) {
        throw new ChatbotXException("Integration Instagram not found")
      }

      const connectedWithFacebookLogin =
        integrationInstagram.type === "facebook"
      const instagramCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(ctx.workspace),
          type: connectedWithFacebookLogin ? "instagramFacebook" : "instagram",
        })
      if (!instagramCredential) {
        throw new ChatbotXException("Instagram App settings not found")
      }

      const redirectUrl = await buildProviderCallbackUrl(
        instagramCredential,
        connectedWithFacebookLogin
          ? "/integrations/instagram-facebook/callback"
          : "/integrations/instagram/callback",
      )
      const referer = buildReconnectReferer({
        channel: "instagram",
        origin: await getOriginUrlFromHeader(),
        returnTo,
        workspaceId,
      })

      const authUrlParams = {
        clientId: instagramCredential.config.clientId,
        version: instagramCredential.config.version,
        redirectUrl,
        stateParams: {
          workspaceId,
          referer,
          reconnectIntegrationId: integrationId,
        },
      }
      // A credential with a Unified Login configuration reconnects through
      // Unified Login, the same dialog its connect opens.
      const authUrl = connectedWithFacebookLogin
        ? generateInstagramFacebookAuthUrl(authUrlParams)
        : generateInstagramAuthUrl({
            ...authUrlParams,
            unifiedLoginConfigId:
              "unifiedLoginConfigId" in instagramCredential.config
                ? instagramCredential.config.unifiedLoginConfigId
                : undefined,
          })

      return redirect(authUrl)
    },
  )
