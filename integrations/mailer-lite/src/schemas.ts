import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const mailerLiteAuthValueSchema = z.object({
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type MailerLiteAuthValue = BaseAuthValue &
  z.infer<typeof mailerLiteAuthValueSchema>

export type MailerLiteConfig = {
  chatbotId: string
}

export type MailerLiteGroup = {
  id: string
  name: string
}

export type MailerLiteField = {
  id: string
  name: string
}

export type MailerLiteActions = {
  testConnection: Handler<
    { ctx: Context<MailerLiteAuthValue>; props: Record<string, never> },
    boolean
  >
  getGroups: Handler<
    { ctx: Context<MailerLiteAuthValue>; props: Record<string, never> },
    MailerLiteGroup[]
  >
  getFields: Handler<
    { ctx: Context<MailerLiteAuthValue>; props: Record<string, never> },
    MailerLiteField[]
  >
  addOrUpdateSubscriber: Handler<
    {
      ctx: Context<MailerLiteAuthValue>
      props: {
        email: string
        firstName?: string
        lastName?: string
        phone?: string
        groupIds?: string[]
        fields?: Record<string, string>
        status?: "active" | "unconfirmed"
        autoresponders?: boolean
      }
    },
    { id: string; email: string }
  >
}
