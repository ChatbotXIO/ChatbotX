"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { generateMarketingMessagesAuthUrl } from "@chatbotx.io/integration-messenger"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import { workspaceActionClient } from "@/lib/safe-action"

export const connectMarketingMessagesAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      ctx,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
    }) => {
      // Marketing Messages reuses the Messenger Facebook app credential; the
      // dialog differs only in carrying the Login-for-Business `config_id`.
      const messengerCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(ctx.workspace),
          type: "messenger",
        })
      const configId = messengerCredential?.config.marketingMessagesConfigId
      if (!(messengerCredential && configId)) {
        const t = await getTranslations()
        throw new ChatbotXException(
          t("facebookMarketingMessages.errors.notConfigured"),
        )
      }

      // Only the Messenger callback is registered as a redirect_uri with the
      // Facebook app, so this OAuth lands there too; `flow` marks the dispatch.
      const redirectUrl = await buildProviderCallbackUrl(
        messengerCredential,
        "/integrations/messenger/callback",
      )
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${ctx.workspace.id}/fb-marketing-messages`,
        baseUrl,
      ).toString()

      return redirect(
        generateMarketingMessagesAuthUrl({
          clientId: messengerCredential.config.clientId,
          configId,
          version: messengerCredential.config.version,
          redirectUrl,
          stateParams: {
            workspaceId: ctx.workspace.id,
            referer,
            flow: "facebookMarketingMessages",
          },
        }),
      )
    },
  )
