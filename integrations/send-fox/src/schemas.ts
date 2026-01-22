import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const sendFoxAuthValueSchema = z.object({
  accessToken: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type SendFoxAuthValue = BaseAuthValue &
  z.infer<typeof sendFoxAuthValueSchema>

export type SendFoxConfig = {
  chatbotId: string
}

export type SendFoxList = {
  id: number
  name: string
}

export type SendFoxActions = {
  testConnection: Handler<
    { ctx: Context<SendFoxAuthValue>; props: Record<string, never> },
    boolean
  >
  getLists: Handler<
    { ctx: Context<SendFoxAuthValue>; props: Record<string, never> },
    SendFoxList[]
  >
  createContact: Handler<
    {
      ctx: Context<SendFoxAuthValue>
      props: {
        email: string
        firstName?: string
        lastName?: string
        listIds?: number[]
      }
    },
    { id: number; email: string }
  >
}
