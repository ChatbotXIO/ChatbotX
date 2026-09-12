"use server"

import {
  integrationWhatsappService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { ensureWhatsappCallsWebhookSubscribed } from "@/features/integration-whatsapp/libs/ensure-calls-webhook-subscribed"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Runs the same app-level `calls` webhook subscription used after
 * save-settings/reconnect, on demand from the Calls-card
 * preflight's "Fix" button. Super-admin only — the button itself is also
 * gated client-side, but the action re-asserts so it is never exploitable
 * by calling it directly.
 */
export const fixWhatsappCallsSubscriptionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
    }: {
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations()
      await assertWorkspaceSuperAdmin(workspaceId)

      const [workspace, integrationWhatsapp] = await Promise.all([
        workspaceService.findById({ id: workspaceId }),
        integrationWhatsappService.findByIdForWorkspace({
          id: integrationWhatsappId,
          workspaceId,
        }),
      ])
      if (!(workspace && integrationWhatsapp)) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }

      const auth = integrationWhatsapp.auth as WhatsappAuthValue
      if (auth.metadata.isManual) {
        throw new ChatbotXException(
          t("whatsapp.calls.preflight.manualIntegrationNotice"),
        )
      }

      const credential = await platformCredentialService.resolveForOwner({
        ownerId: await resolveOwnerForWorkspace(workspace),
        type: "whatsapp",
      })
      if (!credential) {
        throw new ChatbotXException(
          t("whatsapp.connect.errors.appSettingsNotFound"),
        )
      }

      const result = await ensureWhatsappCallsWebhookSubscribed({
        appId: credential.config.clientId,
        appSecret: credential.config.clientSecret,
        verifyToken: credential.config.verifyToken,
      })

      if (result.status === "no-subscription") {
        throw new ChatbotXException(
          t("whatsapp.calls.preflight.appSubscriptionMissing"),
        )
      }

      return { status: result.status }
    },
  )
