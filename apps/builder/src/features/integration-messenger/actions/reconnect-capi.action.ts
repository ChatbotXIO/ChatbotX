"use server"

import {
  messengerIntegrationService,
  metaConversionsService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateCapiAuthUrl } from "@chatbotx.io/integration-messenger"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

export const reconnectMessengerCapiAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      ctx,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      ctx: { workspace: WorkspaceModel }
    }) => {
      const t = await getTranslations("metaConversions.errors")
      await assertWorkspaceSuperAdmin(workspaceId)

      const integrationMessenger =
        await messengerIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integrationMessenger) {
        throw new ChatbotXException(t("messengerNotFound"))
      }

      // ManyChat-style one-click: when the stored page token already carries
      // page_events, connect in place (clear the disconnect flag) — no OAuth
      // round-trip needed. Dataset provisioning is a separate, explicit step
      // the user picks on the CAPI tab (oauthAwaitingDataset state) rather
      // than an implicit side effect of reconnecting.
      if (integrationMessenger.hasCapiScope) {
        await metaConversionsService.reconnectCapi({
          channel: "messenger",
          integration: integrationMessenger,
        })
        return { connected: true }
      }

      const messengerCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(ctx.workspace),
          type: "messenger",
        })
      if (!messengerCredential) {
        throw new ChatbotXException(t("messengerAppNotFound"))
      }

      const redirectUrl = buildBrokerCallbackUrl(
        "/integrations/messenger/callback",
      )
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${workspaceId}/messengers/${integrationId}/capi`,
        baseUrl,
      ).toString()

      return redirect(
        generateCapiAuthUrl({
          clientId: messengerCredential.config.clientId,
          version: messengerCredential.config.version,
          redirectUrl,
          stateParams: {
            workspaceId,
            referer,
            flow: "messengerCapi",
            reconnectIntegrationId: integrationId,
          },
        }),
      )
    },
  )
