import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const getResponseAuthValueSchema = z.object({
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type GetResponseAuthValue = BaseAuthValue &
  z.infer<typeof getResponseAuthValueSchema>

export type GetResponseConfig = {
  chatbotId: string
}

export type GetResponseCampaign = {
  id: string
  name: string
}

export type GetResponseTag = {
  tagId: string
  name: string
}

export type GetResponseActions = {
  testConnection: Handler<
    { ctx: Context<GetResponseAuthValue>; props: Record<string, never> },
    boolean
  >
  getCampaigns: Handler<
    { ctx: Context<GetResponseAuthValue>; props: Record<string, never> },
    GetResponseCampaign[]
  >
  getTags: Handler<
    { ctx: Context<GetResponseAuthValue>; props: Record<string, never> },
    GetResponseTag[]
  >
  addOrUpdateContact: Handler<
    {
      ctx: Context<GetResponseAuthValue>
      props: {
        email: string
        name?: string
        campaignId: string
        dayOfCycle?: string
        tags?: string[]
      }
    },
    { contactId: string }
  >
}
