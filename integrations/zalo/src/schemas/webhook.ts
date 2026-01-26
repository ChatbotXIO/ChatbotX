import z from "zod"

export const recipient = z.object({
  user_id: z.string().min(1),
})
export type Recipient = z.infer<typeof recipient>

export const buttonOpenUrlPayload = z.object({
  url: z.url(),
})
export const buttonOpenPhonePayload = z.object({
  phone_code: z.string(),
})
export const buttonPayload = z.object({
  title: z.string().min(1).max(20),
  payload: z.union([buttonOpenUrlPayload, buttonOpenPhonePayload, z.string()]),
  type: z.union([
    z.literal("oa.open.url"),
    z.literal("oa.query.show"),
    z.literal("oa.query.hide"),
    z.literal("oa.open.sms"),
    z.literal("oa.open.phone"),
  ]),
})
export type ButtonPayload = z.infer<typeof buttonPayload>
export const buttonPayloadTemplate = z.object({
  buttons: z.array(buttonPayload).max(5),
})
export const mediaAttachmentTemplate = z.object({
  media_type: z.union([
    z.literal("image"),
    z.literal("video"),
    z.literal("audio"),
    z.literal("file"),
    z.literal("gif"),
  ]),
  url: z.url().optional(),
  attachment_id: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
})
export const mediaPayloadTemplate = z.object({
  template_type: z.literal("media"),
  elements: z.array(mediaAttachmentTemplate).max(1),
  buttons: z.array(buttonPayload).max(5).optional(),
})
export type MediaPayloadTemplate = z.infer<typeof mediaPayloadTemplate>
export const buttonTemplate = z.object({
  type: z.literal("template"),
  payload: z.union([buttonPayloadTemplate, mediaPayloadTemplate]),
})
export const fileTemplate = z.object({
  type: z.literal("file"),
  payload: z.object({
    token: z.string().min(1),
    buttons: z.array(buttonPayload).max(5).optional(),
  }),
})
export const messageTemplate = z.object({
  text: z.string().min(0).optional(),
  metadata: z.string().optional(),
  attachment: z.union([buttonTemplate, fileTemplate]).optional(),
})
export type MessageTemplate = z.infer<typeof messageTemplate>

export const messageAttachmentSchema = z.object({
  type: z.enum(["image", "video", "audio", "file", "sticker", "location"]),
  payload: z.object({
    url: z.url().optional(),
    thumbnail: z.url().optional(),
    id: z.string().optional(),
    description: z.string().optional(),
    coordinates: z
      .object({
        latitude: z.string(),
        longitude: z.string(),
      })
      .optional(),
  }),
})
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>

export const imageMessageSchema = z.object({
  attachment: z.object({
    type: z.literal("image"),
    payload: z.object({
      url: z.url(),
    }),
  }),
  metadata: z.string().optional(),
})
export type ImageMessageSchema = z.infer<typeof imageMessageSchema>

export const uploadAttachmentResponse = z.object({
  data: z.object({
    attachment_id: z.string().optional(),
    token: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  error: z.number(),
  message: z.string(),
})
export type UploadAttachmentResponse = z.infer<typeof uploadAttachmentResponse>

export const zaloWebhookEventSchema = z.object({
  app_id: z.string(),
  event_name: z.enum([
    "user_send_text",
    "user_send_image",
    "user_send_sticker",
    "user_send_location",
    "user_send_sticker",
    "user_send_file",
    "user_send_audio",
    "user_seen_message",
    "oa_send_msg",
    "oa_send_text",
    "oa_send_image",
    "oa_send_sticker",
    "oa_send_file",
    "oa_send_link",
    "oa_send_video",
    "oa_send_carousel",
    "oa_send_list",
    "oa_send_action",
  ]),
  timestamp: z.string(),
  sender: z.object({
    id: z.string(),
  }),
  recipient: z.object({
    id: z.string(),
  }),
  message: z.object({
    msg_id: z.string().optional(),
    msg_ids: z.array(z.string()).optional(),
    text: z.string().optional(),
    attachments: z.array(messageAttachmentSchema).optional(),
  }),
})
export type ZaloWebhookEvent = z.infer<typeof zaloWebhookEventSchema>

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
