import z from "zod"

export const createWebhookSchema = z.object({
  name: z.string().min(1, "Webhook name is required"),
  folderId: z.cuid2().nullable(),
})
export type CreateWebhookSchema = z.infer<typeof createWebhookSchema>
