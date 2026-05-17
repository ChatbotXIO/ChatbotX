"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type WhatsappCredential,
  type WhatsappCredentialUpdate,
  whatsappCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateWhatsappSettingsAction = organizationActionClient
  .inputSchema(whatsappCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: WhatsappCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "whatsapp",
      })

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("App Secret is required to configure WhatsApp.")
      }

      const systemUserToken =
        parsedInput.systemUserToken || existing?.config.systemUserToken
      if (!systemUserToken) {
        throw new Error("System User Token is required to configure WhatsApp.")
      }

      const config: WhatsappCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        configId: parsedInput.configId,
        systemUserId: parsedInput.systemUserId,
        businessId: parsedInput.businessId,
        businessName: parsedInput.businessName,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
        systemUserToken,
      }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "whatsapp",
        config,
      })
    },
  )
