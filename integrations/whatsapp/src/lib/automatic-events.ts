import { z } from "zod"

export const whatsappAutomaticEventNames = [
  "LeadSubmitted",
  "Purchase",
] as const

export const whatsappAutomaticEventNameSchema = z.enum(
  whatsappAutomaticEventNames,
)

export const whatsappAutomaticEventPayloadSchema = z.object({
  event_name: whatsappAutomaticEventNameSchema,
  id: z.string().trim().min(1),
  timestamp: z.union([z.number(), z.string().trim().min(1)]),
  ctwa_clid: z.string().trim().min(1),
  custom_data: z
    .object({
      currency: z.string().trim().min(1),
      value: z.union([z.number(), z.string().trim().min(1)]),
    })
    .optional(),
})

export const whatsappAutomaticEventsValueSchema = z.object({
  metadata: z.object({
    phone_number_id: z.string().trim().min(1),
  }),
  automatic_events: z.array(whatsappAutomaticEventPayloadSchema),
})

export type WhatsappAutomaticEventName = z.infer<
  typeof whatsappAutomaticEventNameSchema
>
export type WhatsappAutomaticEventPayload = z.infer<
  typeof whatsappAutomaticEventPayloadSchema
>
export type WhatsappAutomaticEventsValue = z.infer<
  typeof whatsappAutomaticEventsValueSchema
>
