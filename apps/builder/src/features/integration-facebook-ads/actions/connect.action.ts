"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { generateAdsAuthUrl } from "@chatbotx.io/integration-facebook-ads"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

export const connectFacebookAds = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      ctx,
    }: {
      ctx: {
        user: UserModel
        workspace: WorkspaceModel
      }
    }) => {
      // Facebook Ads reuses the Messenger Facebook app credential; the OAuth
      // dialog only differs in the requested scopes (ads_read, ads_management).
      const messengerCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(ctx.workspace),
          type: "messenger",
        })
      if (!messengerCredential) {
        const t = await getTranslations()
        throw new ChatbotXException(t("facebookAds.errors.invalidAppSettings"))
      }

      // Only the Messenger callback is registered as a redirect_uri with the
      // Facebook app, so Facebook Ads OAuth lands there too. `flow` flags the
      // Ads token-storage dispatch in the callback handler; `referer` is the
      // page the user returns to on completion or cancel. Mirrors
      // `generateMessengerRedirectUri` in integration-messenger/libs/oauth.ts.
      const redirectUrl = buildBrokerCallbackUrl(
        "/integrations/messenger/callback",
      )
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${ctx.workspace.id}/settings/integrations`,
        baseUrl,
      ).toString()

      const authUrl = generateAdsAuthUrl({
        clientId: messengerCredential.config.clientId,
        version: messengerCredential.config.version,
        redirectUrl,
        stateParams: {
          workspaceId: ctx.workspace.id,
          referer,
          flow: "facebookAds",
        },
      })

      return redirect(authUrl)
    },
  )
