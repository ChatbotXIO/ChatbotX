"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type GoogleCredential,
  type GoogleCredentialUpdate,
  googleCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateGoogleSettingsAction = organizationActionClient
  .inputSchema(googleCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: GoogleCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "google",
      })

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("Client Secret is required to configure Google.")
      }

      const verifyToken =
        parsedInput.verifyToken || existing?.config.verifyToken
      if (!verifyToken) {
        throw new Error("Verify Token is required to configure Google.")
      }

      const config: GoogleCredential = {
        clientId: parsedInput.clientId,
        clientSecret,
        verifyToken,
      }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "google",
        config,
      })
    },
  )
