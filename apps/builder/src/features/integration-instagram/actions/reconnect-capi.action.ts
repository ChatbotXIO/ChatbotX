"use server"

import {
  instagramIntegrationService,
  metaConversionsService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateCapiAuthUrl } from "@chatbotx.io/integration-instagram-facebook"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

export const reconnectInstagramCapiAction = workspaceActionClient
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

      const integrationInstagram =
        await instagramIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integrationInstagram) {
        throw new ChatbotXException(t("instagramNotFound"))
      }
      if (integrationInstagram.type !== "facebook") {
        throw new ChatbotXException(t("instagramRequiresFacebook"))
      }

      // ManyChat-style one-click: when the stored token already carries
      // instagram_manage_events, connect in place (clear the disconnect
      // flag) — no OAuth round-trip. Dataset provisioning is a separate,
      // explicit step the user picks on the CAPI tab (oauthAwaitingDataset
      // state) rather than an implicit side effect of reconnecting.
      if (integrationInstagram.hasCapiScope) {
        await metaConversionsService.reconnectCapi({
          channel: "instagram",
          integration: integrationInstagram,
        })
        return { connected: true }
      }

      const instagramCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(ctx.workspace),
          type: "instagramFacebook",
        })
      if (!instagramCredential) {
        throw new ChatbotXException(t("instagramAppNotFound"))
      }

      const redirectUrl = buildBrokerCallbackUrl(
        "/integrations/instagram-facebook/callback",
      )
      const baseUrl = await getOriginUrlFromHeader()
      const referer = new URL(
        `/space/${workspaceId}/instagrams/${integrationId}/capi`,
        baseUrl,
      ).toString()

      return redirect(
        generateCapiAuthUrl({
          clientId: instagramCredential.config.clientId,
          version: instagramCredential.config.version,
          redirectUrl,
          stateParams: {
            workspaceId,
            referer,
            flow: "instagramCapi",
            reconnectIntegrationId: integrationId,
          },
        }),
      )
    },
  )
