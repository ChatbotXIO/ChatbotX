"use server"

import {
  canUseOwnCredentials,
  platformCredentialService,
} from "@chatbotx.io/business"
import {
  type StripeCredential,
  type StripeCredentialUpdate,
  stripeCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"

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
      if (isCloud() && !(await canUseOwnCredentials(ctx.user.id))) {
        throw new Error("Unauthorized")
      }
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const config: StripeCredential = {
        publishableKey: parsedInput.publishableKey,
        verifyToken: parsedInput.verifyToken,
        secretKey: parsedInput.secretKey,
      }

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "stripe",
        config,
      })
    },
  )
