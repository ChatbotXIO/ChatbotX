import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const moosendAuthValueSchema = z.object({
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type MoosendAuthValue = BaseAuthValue &
  z.infer<typeof moosendAuthValueSchema>

export type MoosendConfig = {
  chatbotId: string
}

export type MoosendList = {
  id: string
  name: string
}

export type MoosendActions = {
  testConnection: Handler<
    { ctx: Context<MoosendAuthValue>; props: Record<string, never> },
    boolean
  >
  getLists: Handler<
    { ctx: Context<MoosendAuthValue>; props: Record<string, never> },
    MoosendList[]
  >
  createContact: Handler<
    {
      ctx: Context<MoosendAuthValue>
      props: {
        email: string
        name?: string
        listId: string
      }
    },
    { id: string; email: string }
  >
}
