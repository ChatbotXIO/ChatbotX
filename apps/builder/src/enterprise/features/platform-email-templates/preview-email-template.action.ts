"use server"

import { compileEmailPreview } from "@chatbotx.io/mail/preview"
import { z } from "zod"
import { platformAdminActionClient } from "@/lib/safe-action"

export const previewEmailTemplateAction = platformAdminActionClient
  .inputSchema(z.object({ body: z.string().max(100_000) }))
  .action(async ({ parsedInput }) => compileEmailPreview(parsedInput.body))
