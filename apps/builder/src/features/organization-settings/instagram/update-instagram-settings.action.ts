"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type InstagramCredential,
  type InstagramCredentialUpdate,
  instagramCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateInstagramSettingAction = organizationActionClient
  .inputSchema(instagramCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: InstagramCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "instagram",
      })

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("App Secret is required to configure Instagram.")
      }

      const config: InstagramCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "instagram",
        config,
      })
    },
  )
