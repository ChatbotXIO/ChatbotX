import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const emailProviders = z.enum(["gmail", "outlook", "other"])

export const createEmailRequest = z.object({
  name: z.string().min(1).max(40),
  workspaceId: zodBigintAsString().nullish(),
  provider: emailProviders,
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  fromAddress: z.string().email(),
})
export type CreateEmailRequest = z.infer<typeof createEmailRequest>

export const updateEmailRequest = createEmailRequest.partial()
export type UpdateEmailRequest = z.infer<typeof updateEmailRequest>
