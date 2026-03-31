import z from "zod"

export const createWebhookSchema = z.object({
  name: z.string().min(1, "Webhook name is required"),
  folderId: z.bigint().nullable(),
})
export type CreateWebhookSchema = z.infer<typeof createWebhookSchema>
