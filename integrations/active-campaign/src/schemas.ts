import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const activeCampaignAuthValueSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type ActiveCampaignAuthValue = BaseAuthValue &
  z.infer<typeof activeCampaignAuthValueSchema>

export type ActiveCampaignConfig = {
  chatbotId: string
}

export type ActiveCampaignActions = {
  testConnection: Handler<
    { ctx: Context<ActiveCampaignAuthValue>; props: Record<string, never> },
    { success: boolean; message?: string }
  >
}
