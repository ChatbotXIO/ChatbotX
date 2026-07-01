"use server"

import { isPlatformAdmin, isSuperAdmin } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import { compileEmailPreview } from "@chatbotx.io/mail/preview"
import { z } from "zod"
import { authActionClient } from "@/lib/safe-action"

export const previewEmailTemplateAction = authActionClient
  .inputSchema(z.object({ body: z.string().max(100_000) }))
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: { body: string }
    }) => {
      if (!(isSuperAdmin(ctx.user) || (await isPlatformAdmin(ctx.user)))) {
        throw new Error("Unauthorized")
      }
      return compileEmailPreview(parsedInput.body)
    },
  )
