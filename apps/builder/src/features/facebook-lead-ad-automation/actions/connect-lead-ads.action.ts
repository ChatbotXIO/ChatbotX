"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { generateLeadAdsAuthUrl } from "@chatbotx.io/integration-messenger"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

export const connectLeadAdsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      ctx,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
    }) => {
      // Lead Ads reuses the Messenger Facebook app credential; the OAuth dialog
      // only differs in the requested scopes (leads_retrieval + page scopes).
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
      // Facebook app, so this OAuth lands there too. `flow` flags the lead-ads
      // dispatch in the callback handler; `referer` returns the user to the
      // Lead Ads list on completion or cancel.
      const redirectUrl = buildBrokerCallbackUrl(
        "/integrations/messenger/callback",
      )
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${ctx.workspace.id}/fb-lead-ads`,
        baseUrl,
      ).toString()

      const authUrl = generateLeadAdsAuthUrl({
        clientId: messengerCredential.config.clientId,
        version: messengerCredential.config.version,
        redirectUrl,
        stateParams: {
          workspaceId: ctx.workspace.id,
          referer,
          flow: "facebookLeadAds",
        },
      })

      return redirect(authUrl)
    },
  )
