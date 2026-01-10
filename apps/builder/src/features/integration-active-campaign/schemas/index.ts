import { z } from "zod"

export const connectActiveCampaignSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().min(1),
})

export type ConnectActiveCampaignSchema = z.infer<
  typeof connectActiveCampaignSchema
>

export const activeCampaignQuerySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lists") }),
  z.object({ action: z.literal("tags") }),
  z.object({ action: z.literal("fields") }),
  z.object({ action: z.literal("automations") }),
])

export type ActiveCampaignQuerySchema = z.infer<
  typeof activeCampaignQuerySchema
>
