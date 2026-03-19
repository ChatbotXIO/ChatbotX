import { z } from "zod"
import {
  botMessageFallbackReasonSchema,
  botMessageResponseTypeSchema,
  botMessageResultSchema,
  botMessageRouteTypeSchema,
} from "./bot-message"
import { triggerContextSchema } from "./trigger-context"

const trackBotRequestSchema = z.object({
  aiProvider: z.string(),
  chatbotId: z.string(),
  conversationId: z.string(),
  hasResponse: z.boolean(),
  messageId: z.string(),
  metadata: z
    .object({
      flowId: z.string().optional(),
      intentId: z.string().optional(),
      intentConfidence: z.number().optional(),
      fallbackReason: botMessageFallbackReasonSchema.optional(),
    })
    .optional(),
  responseType: botMessageResponseTypeSchema,
  result: botMessageResultSchema.optional(),
  routeType: botMessageRouteTypeSchema.optional(),
  startTime: z.number(),
  triggerContext: triggerContextSchema.optional(),
})
export type TrackBotRequest = z.infer<typeof trackBotRequestSchema>
