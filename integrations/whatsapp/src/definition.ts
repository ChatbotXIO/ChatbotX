import {
  contextSchema,
  conversationEntitySchema,
  messageEntitySchema,
} from "@ahachat.ai/sdk"
import type { OnSentArgs } from "whatsapp-api-js/emitters"
import { z } from "zod"

const whatsappMessageSchema = z.custom<OnSentArgs>((data) => {
  return typeof data === "object" && "phoneID" in data
})

export const whatsappIntegrationDefinition = z.object({
  name: z.string(),
  actions: z.object({
    receiveMessage: z.object({
      input: z.object({
        ctx: contextSchema,
        conversation: conversationEntitySchema,
        message: messageEntitySchema,
      }),
      output: z.promise(
        z.object({
          message: messageEntitySchema,
          conversation: conversationEntitySchema,
        }),
      ),
    }),
    sendMessage: z.object({
      input: z.object({
        ctx: contextSchema,
        conversation: conversationEntitySchema,
        message: messageEntitySchema,
      }),
      output: z.void(),
    }),
  }),
  handleRequest: z.function().args(
    z.object({
      ctx: contextSchema,
      req: z.custom<Request>(),
    }),
  ),
})

export type WhatsappIntegrationDefinition = z.infer<
  typeof whatsappIntegrationDefinition
>
