"use server"

import { credentialService } from "@chatbotx.io/business"
import {
  type StripeCredential,
  type StripeCredentialUpdate,
  stripeCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { orgAdminActionClient } from "@/lib/safe-action"

export const updateStripeSettingsAction = orgAdminActionClient
  .inputSchema(stripeCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: StripeCredentialUpdate
    }) => {
      const existing = await credentialService.findDecryptedForUser({
        userId: ctx.user.id,
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

      await credentialService.upsertForUser({
        userId: ctx.user.id,
        type: "stripe",
        config,
      })
    },
  )
