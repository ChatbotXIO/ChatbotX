import {
  contactInfoTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import z from "zod"

export const contactInfoUpdated = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
    ),
  type: z
    .literal(triggerEventTypes.enum.contactInfoUpdated)
    .describe('Condition type "contactInfoUpdated".'),
  sourceId: contactInfoTypes.describe(
    "Which contact info update fires the trigger: `phone` or `email`.",
  ),
})
export type ContactInfoUpdated = z.infer<typeof contactInfoUpdated>

export const defaultFn = (): ContactInfoUpdated => ({
  type: triggerEventTypes.enum.contactInfoUpdated,
  sourceId: contactInfoTypes.enum.phone,
})
export type DefaultFn = typeof defaultFn
