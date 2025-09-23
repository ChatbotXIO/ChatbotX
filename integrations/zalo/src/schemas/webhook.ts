import z from "zod"

export const ZALO_MESSAGE_METADATA = "SENT_FROM_AHACHATAI"

export const recipient = z.object({
  user_id: z.string().min(1),
})
export type Recipient = z.infer<typeof recipient>

export const zaloWebhookEventSchema = z.object({
  app_id: z.string(),
  user_id_by_app: z.string(),
  event_name: z.enum([
    "user_send_text",
    "user_send_image",
    "user_send_sticker",
    "follow",
    "unfollow",
    "oa_send_msg",
    "user_seen_msg",
  ]),
  timestamp: z.string(),
  sender: z.object({
    id: z.string(),
  }),
  recipient: z.object({
    id: z.string(),
  }),
  message: z
    .object({
      msg_id: z.string(),
      text: z.string().optional(),
      attachments: z.array(z.any()).optional(),
    })
    .optional(),
})
export type ZaloWebhookEvent = z.infer<typeof zaloWebhookEventSchema>

export const textMessageSchema = z.object({
  text: z.string().min(0),
  metadata: z.string().optional(),
})
export type TextMessageSchema = z.infer<typeof textMessageSchema>

export const imageMessageSchema = z.object({
  attachment: z.object({
    type: z.literal("image"),
    payload: z.object({
      url: z.string().url(),
    }),
  }),
  metadata: z.string().optional(),
})
export type ImageMessageSchema = z.infer<typeof imageMessageSchema>

export const messageTemplate = z.union([
  textMessageSchema,
  imageMessageSchema,
  // TODO
])
export type MessageTemplate = z.infer<typeof messageTemplate>

export const zaloSendMessageRequest = z.object({
  recipient,
  message: messageTemplate,
})
export type ZaloSendMessageRequest = z.infer<typeof zaloSendMessageRequest>

export const zaloSendMessageResponseSchema = z.object({
  recipient_id: z.string(),
  message_id: z.string().optional(),
  attachment_id: z.string().optional(),
})
export type ZaloSendMessageResponse = z.infer<
  typeof zaloSendMessageResponseSchema
>
