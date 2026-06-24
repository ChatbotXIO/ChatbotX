"use server"

import { provisionResellerAccount } from "@chatbotx.io/auth/provisioning"
import { z } from "zod"
import { platformAdminActionClient } from "@/lib/safe-action"

const provisionResellerAccountRequest = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  signInUrl: z.string().trim().url().optional(),
})

/**
 * Provision an end-customer sub-account on behalf of the calling reseller
 * (white-label owner / platform admin). The sub-account is created under the
 * reseller's tenant with a forced password change, and the initial credentials
 * are emailed over the reseller's own SMTP transport. Hard-fails if the reseller
 * has no SMTP credential configured.
 */
export const provisionResellerAccountAction = platformAdminActionClient
  .inputSchema(provisionResellerAccountRequest)
  .action(async ({ ctx, parsedInput }) =>
    provisionResellerAccount({
      resellerUserId: ctx.user.id,
      email: parsedInput.email,
      name: parsedInput.name,
      signInUrl: parsedInput.signInUrl,
    }),
  )
