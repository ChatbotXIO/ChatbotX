"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type StripeCredential,
  type StripeCredentialUpdate,
  stripeCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateStripeSettingsAction = organizationActionClient
  .inputSchema(stripeCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: StripeCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "stripe",
      })

      const secretKey = parsedInput.secretKey || existing?.config.secretKey
      if (!secretKey) {
        throw new Error("Secret Key is required to configure Stripe.")
      }

      const config: StripeCredential = {
        publishableKey: parsedInput.publishableKey,
        verifyToken: parsedInput.verifyToken,
        secretKey,
      }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "stripe",
        config,
      })
    },
  )
