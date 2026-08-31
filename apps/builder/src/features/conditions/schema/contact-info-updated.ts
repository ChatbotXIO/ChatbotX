import {
  contactInfoTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import z from "zod"

export const contactInfoUpdated = z.object({
  id: z.string().optional(),
  type: z.literal(triggerEventTypes.enum.contactInfoUpdated),
  sourceId: contactInfoTypes,
})
export type ContactInfoUpdated = z.infer<typeof contactInfoUpdated>

export const defaultFn = (): ContactInfoUpdated => ({
  type: triggerEventTypes.enum.contactInfoUpdated,
  sourceId: contactInfoTypes.enum.phone,
})
export type DefaultFn = typeof defaultFn
