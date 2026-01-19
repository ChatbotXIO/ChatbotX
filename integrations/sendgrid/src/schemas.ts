import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const sendGridAuthValueSchema = z.object({
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type SendGridAuthValue = BaseAuthValue &
  z.infer<typeof sendGridAuthValueSchema>

export type SendGridConfig = {
  chatbotId: string
}

export type SendGridList = {
  id: string
  name: string
}

export type SendGridField = {
  id: string
  name: string
}

export type SendGridActions = {
  testConnection: Handler<
    { ctx: Context<SendGridAuthValue>; props: Record<string, never> },
    boolean
  >
  getLists: Handler<
    { ctx: Context<SendGridAuthValue>; props: Record<string, never> },
    SendGridList[]
  >
  getCustomFields: Handler<
    { ctx: Context<SendGridAuthValue>; props: Record<string, never> },
    SendGridField[]
  >
  addOrUpdateContact: Handler<
    {
      ctx: Context<SendGridAuthValue>
      props: {
        email: string
        firstName?: string
        lastName?: string
        phone?: string
        listIds?: string[]
        customFields?: Record<string, string>
      }
    },
    { job_id: string }
  >
}
