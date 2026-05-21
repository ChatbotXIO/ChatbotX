"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type ZaloCredential,
  type ZaloCredentialUpdate,
  zaloCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { orgAdminActionClient } from "@/lib/safe-action"

export const updateZaloSettingsAction = orgAdminActionClient
  .inputSchema(zaloCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: ZaloCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "zalo",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(t("organizationSettings.errors.zaloAppSecretRequired"))
      }

      const config: ZaloCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "zalo",
        config,
      })
    },
  )
