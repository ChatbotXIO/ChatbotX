"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type StripeCredential,
  type StripeCredentialUpdate,
  stripeCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { orgAdminActionClient } from "@/lib/safe-action"

export const updateStripeSettingsAction = orgAdminActionClient
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

      const t = await getTranslations()

      const secretKey = parsedInput.secretKey || existing?.config.secretKey
      if (!secretKey) {
        throw new Error(
          t("organizationSettings.errors.stripeSecretKeyRequired"),
        )
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
