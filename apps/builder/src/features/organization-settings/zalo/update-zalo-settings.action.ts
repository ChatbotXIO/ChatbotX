"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type ZaloCredential,
  type ZaloCredentialUpdate,
  zaloCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateZaloSettingsAction = organizationActionClient
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

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("App Secret is required to configure Zalo.")
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
