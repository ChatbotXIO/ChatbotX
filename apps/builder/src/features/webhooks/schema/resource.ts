import { createSelectSchema, webhookModel } from "@chatbotx.io/database/schema"
import z from "zod"

// Explicit `.pick()` so a future column added to `Webhook` (e.g. secret
// signing material) never silently enters the public contract.
export const publicWebhookResource = createSelectSchema(webhookModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
}).pick({
  id: true,
  name: true,
  url: true,
  active: true,
  createdAt: true,
  updatedAt: true,
})
