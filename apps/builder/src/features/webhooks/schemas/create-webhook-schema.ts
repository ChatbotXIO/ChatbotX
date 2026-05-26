import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const createWebhookSchema = z.object({
  name: z.string().min(1, "Nome do webhook é obrigatório"),
  folderId: zodBigintAsString().nullable(),
})
export type CreateWebhookSchema = z.infer<typeof createWebhookSchema>
