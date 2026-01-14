import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const dripAuthValueSchema = z.object({
  apiToken: z.string().min(1),
  accountId: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type DripAuthValue = BaseAuthValue & z.infer<typeof dripAuthValueSchema>

export type DripConfig = {
  chatbotId: string
}

export type DripActions = {
  testConnection: Handler<
    { ctx: Context<DripAuthValue>; props: Record<string, never> },
    boolean
  >
  getAccounts: Handler<
    { ctx: Context<DripAuthValue>; props: Record<string, never> },
    Array<{ id: string; name: string }>
  >
  getTags: Handler<
    { ctx: Context<DripAuthValue>; props: Record<string, never> },
    string[]
  >
  getCustomFields: Handler<
    { ctx: Context<DripAuthValue>; props: Record<string, never> },
    DripCustomField[]
  >
  syncSubscriber: Handler<
    {
      ctx: Context<DripAuthValue>
      props: {
        email: string
        firstName?: string
        lastName?: string
        phone?: string
        tags?: string[]
        customFields?: Record<string, string>
      }
    },
    { subscriber: { id: string; email: string } }
  >
}

export type DripTag = string

export type DripCustomField = {
  id: string
  identifier: string
  label: string
}
