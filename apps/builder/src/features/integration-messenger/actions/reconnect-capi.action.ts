"use server"

import {
  messengerIntegrationService,
  metaConversionsService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateCapiAuthUrl } from "@chatbotx.io/integration-messenger"
import { ensureDataset } from "@chatbotx.io/integration-meta-conversions"
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
      // page_events, connect in place (idempotent POST /{page_id}/dataset +
      // clear the disconnect flag) — no OAuth round-trip needed. OAuth is only
      // for tokens that still lack the permission.
      if (integrationMessenger.hasCapiScope) {
        await metaConversionsService.provisionDatasetNow({
          channel: "messenger",
          integration: integrationMessenger,
          provisionDataset: ({ accessToken, resourceId }) =>
            ensureDataset({ resourceType: "page", resourceId, accessToken }),
        })
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
