"use server"

import {
  canUseOwnCredentials,
  platformCredentialService,
} from "@chatbotx.io/business"

import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const deleteStripeSettingsAction = authActionClient.action(
  async ({ ctx }) => {
    if (isCloud() && !(await canUseOwnCredentials(ctx.user.id))) {
      throw new Error("Unauthorized")
    }
    await platformCredentialService.remove({
      userId: isCloud() ? ctx.user.id : undefined,
      type: "stripe",
    })
  },
)
