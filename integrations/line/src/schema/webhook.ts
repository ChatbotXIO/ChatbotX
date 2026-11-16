import { z } from "zod"

const lineSourceSchema = z.object({
  type: z.string(),
  userId: z.string().optional(),
  groupId: z.string().optional(),
  roomId: z.string().optional(),
})

const lineMessageSchema = z.looseObject({
  id: z.string().optional(),
  type: z.string(),
})

export const lineWebhookEventSchema = z.looseObject({
  type: z.string(),
  timestamp: z.number().optional(),
  webhookEventId: z.string().optional(),
  source: lineSourceSchema.optional(),
  replyToken: z.string().optional(),
  deliveryContext: z.object({ isRedelivery: z.boolean() }).optional(),
  message: lineMessageSchema.optional(),
  postback: z.looseObject({ data: z.string() }).optional(),
})

export const lineWebhookBodySchema = z.object({
  destination: z.string(),
  events: z.array(lineWebhookEventSchema),
})

export type LineWebhookEvent = z.infer<typeof lineWebhookEventSchema>
export type LineWebhookBody = z.infer<typeof lineWebhookBodySchema>
