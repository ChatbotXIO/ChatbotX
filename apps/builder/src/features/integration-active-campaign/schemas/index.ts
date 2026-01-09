import { z } from "zod"

export const connectActiveCampaignSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().min(1),
})

export type ConnectActiveCampaignSchema = z.infer<
  typeof connectActiveCampaignSchema
>
