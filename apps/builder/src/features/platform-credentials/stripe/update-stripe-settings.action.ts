"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type StripeCredential,
  type StripeCredentialUpdate,
  stripeCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const updateStripeSettingsAction = authActionClient
  .inputSchema(stripeCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: StripeCredentialUpdate
    }) => {
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const existing = await platformCredentialService.findDecrypted({
        userId: scopedUserId,
        type: "stripe",
      })

      const t = await getTranslations()

      const secretKey = parsedInput.secretKey || existing?.config.secretKey
      if (!secretKey) {
        throw new Error(t("platformSettings.errors.stripeSecretKeyRequired"))
      }

      const config: StripeCredential = {
        publishableKey: parsedInput.publishableKey,
        verifyToken: parsedInput.verifyToken,
        secretKey,
      }

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "stripe",
        config,
      })
    },
  )
