"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type MessengerCredential,
  type MessengerCredentialUpdate,
  messengerCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { organizationActionClient } from "@/lib/safe-action"

export const updateMessengerSettingAction = organizationActionClient
  .inputSchema(messengerCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: MessengerCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "messenger",
      })

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("App Secret is required to configure Messenger.")
      }

      const config: MessengerCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "messenger",
        config,
      })
    },
  )
