"use server"

import {
  integrationWhatsappService,
  metaConversionsService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { getDataset } from "@chatbotx.io/integration-meta-conversions"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { capiDatasetProvisioner } from "@/features/meta-conversions/lib/provision-capi-dataset"
import { surfaceCapiError } from "@/features/meta-conversions/lib/surface-capi-error"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { resolveProviderOriginForCredential } from "@/lib/provider-origin"
import { workspaceActionClient } from "@/lib/safe-action"
import { exchangeCodeForOwnedWabaToken } from "../libs/exchange-waba-token"

const connectWhatsappCapiSchema = z.object({
  code: z.string().trim().min(1),
})

/**
 * Completes the dedicated Conversions API connect for a WhatsApp number: the
 * Embedded Signup popup (opened with the platform's `capiConfigId`) relayed a
 * `code`, which is exchanged for a token that must belong to this integration's
 * own WhatsApp Business Account. The token and its dataset are stored together;
 * the channel's own credentials are never touched.
 */
export const connectWhatsappCapiAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(connectWhatsappCapiSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      ctx,
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: z.infer<typeof connectWhatsappCapiSchema>
    }) => {
      const t = await getTranslations()
      await assertWorkspaceSuperAdmin(workspaceId)

      const integration = await integrationWhatsappService.findByIdForWorkspace(
        { id: integrationId, workspaceId },
      )
      if (!integration) {
        throw new ChatbotXException(
          t("metaConversions.errors.whatsappNotFound"),
        )
      }

      const credential = await platformCredentialService.resolveForOwner({
        ownerId: await resolveOwnerForWorkspace(ctx.workspace),
        type: "whatsapp",
      })
      if (!credential) {
        throw new ChatbotXException(
          t("whatsapp.connect.errors.appSettingsNotFound"),
        )
      }

      const { accessToken } = await exchangeCodeForOwnedWabaToken({
        code: parsedInput.code,
        existing: integration,
        whatsappSettings: credential.config,
        originUrl: await resolveProviderOriginForCredential(credential),
        messages: {
          wabaResolveFailed: t("whatsapp.connect.errors.wabaResolveFailed"),
          wabaMismatch: t("metaConversions.errors.wabaMismatch"),
        },
      })

      let connected: Awaited<
        ReturnType<
          typeof metaConversionsService.connectCapiWithToken<"whatsapp">
        >
      >
      try {
        connected = await metaConversionsService.connectCapiWithToken({
          channel: "whatsapp",
          integration,
          accessToken,
          provisionDataset: capiDatasetProvisioner("whatsapp"),
          validate: getDataset,
        })
      } catch (error) {
        surfaceCapiError(error)
      }
      // The write matched no row: the integration was removed after the lookup.
      if (!connected) {
        throw new ChatbotXException(
          t("metaConversions.errors.whatsappNotFound"),
        )
      }

      await auditService.record({
        action: "update",
        detail: "connected the Conversions API for the whatsapp channel",
      })
      return { success: true }
    },
  )
