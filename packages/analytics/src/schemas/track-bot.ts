import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  botMessageFallbackReasons,
  botMessageResults,
  botMessageRouteTypes,
  trackingResponseTypes,
} from "./bot-message"
import { triggerContextSchema } from "./trigger-context"

const trackBotRequestSchema = z.object({
  aiProvider: z.string(),
  workspaceId: zodBigintAsString(),
  conversationId: zodBigintAsString(),
  hasResponse: z.boolean(),
  messageId: zodBigintAsString(),
  metadata: z
    .object({
      flowId: zodBigintAsString().optional(),
      intentId: z.string().optional(),
      intentConfidence: z.number().optional(),
      fallbackReason: botMessageFallbackReasons.optional(),
    })
    .optional(),
  responseType: trackingResponseTypes,
  result: botMessageResults.optional(),
  routeType: botMessageRouteTypes.optional(),
  startTime: z.number(),
  triggerContext: triggerContextSchema.optional(),
})
export type TrackBotRequest = z.infer<typeof trackBotRequestSchema>
