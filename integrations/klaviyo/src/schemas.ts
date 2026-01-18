import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const klaviyoAuthValueSchema = z.object({
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type KlaviyoAuthValue = BaseAuthValue &
  z.infer<typeof klaviyoAuthValueSchema>

export type KlaviyoConfig = {
  chatbotId: string
}

export type KlaviyoList = {
  id: string
  name: string
}

export type KlaviyoTag = {
  id: string
  name: string
}

export type KlaviyoField = {
  id: string
  label: string
}

export type KlaviyoActions = {
  testConnection: Handler<
    { ctx: Context<KlaviyoAuthValue>; props: Record<string, never> },
    boolean
  >
  getLists: Handler<
    { ctx: Context<KlaviyoAuthValue>; props: Record<string, never> },
    KlaviyoList[]
  >
  getTags: Handler<
    { ctx: Context<KlaviyoAuthValue>; props: Record<string, never> },
    KlaviyoTag[]
  >
  getFields: Handler<
    { ctx: Context<KlaviyoAuthValue>; props: Record<string, never> },
    KlaviyoField[]
  >
  syncProfile: Handler<
    {
      ctx: Context<KlaviyoAuthValue>
      props: {
        email: string
        phone?: string
        firstName?: string
        lastName?: string
        title?: string
        organization?: string
        listId?: string
        tags?: string[]
        customFields?: Record<string, unknown>
      }
    },
    { id: string; email: string }
  >
}
