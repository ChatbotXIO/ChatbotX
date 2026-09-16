"use server"

import {
  integrationThreadsService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { generateAuthUrl } from "@chatbotx.io/integration-threads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import { workspaceActionClient } from "@/lib/safe-action"

export const reconnectThreadsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, integrationId], ctx }) => {
      const t = await getTranslations()
      const integrationThreads =
        await integrationThreadsService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integrationThreads) {
        throw new ChatbotXException(t("channels.reconnect.errors.notFound"))
      }

      const credential = await platformCredentialService.resolveForOwner({
        ownerId: await resolveOwnerForWorkspace(ctx.workspace),
        type: "threads",
      })
      if (!credential) {
        throw new ChatbotXException(t("messages.needToAddSettings"))
      }

      const referer = new URL(
        `/space/${workspaceId}/settings/channels?channel=threads`,
        await getOriginUrlFromHeader(),
      ).toString()

      // Must match the redirect_uri used at authorize time — the tenant's
      // custom domain for a tenant-owned credential, else the broker.
      const redirectUrl = await buildProviderCallbackUrl(
        credential,
        "/integrations/threads/callback",
      )

      return redirect(
        generateAuthUrl({
          clientId: credential.config.clientId,
          redirectUrl,
          stateParams: {
            workspaceId,
            referer,
            reconnectIntegrationId: integrationId,
          },
        }),
      )
    },
  )
