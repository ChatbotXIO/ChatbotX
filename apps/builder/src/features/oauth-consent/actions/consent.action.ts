"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@/lib/auth/auth"
import { authActionClient } from "@/lib/safe-action"

const consentRequest = z.object({
  accept: z.boolean(),
  consentCode: z.string().min(1),
})

export const submitOAuthConsentAction = authActionClient
  .inputSchema(consentRequest)
  .action(
    async ({ parsedInput }) =>
      await auth.api.oAuthConsent({
        body: {
          accept: parsedInput.accept,
          consent_code: parsedInput.consentCode,
        },
        headers: await headers(),
      }),
  )
