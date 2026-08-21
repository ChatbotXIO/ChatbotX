import { z } from "zod"

/**
 * Partial update of the Meta calling settings — only provided fields are
 * sent to `/{phone-number-id}/settings`, mirroring Meta's merge semantics.
 */
export const updateWhatsappCallingSettingsSchema = z.object({
  status: z.enum(["ENABLED", "DISABLED"]).optional(),
  callIconVisibility: z.enum(["DEFAULT", "DISABLE_ALL"]).optional(),
  callbackPermissionStatus: z.enum(["ENABLED", "DISABLED"]).optional(),
})

export type UpdateWhatsappCallingSettingsSchema = z.infer<
  typeof updateWhatsappCallingSettingsSchema
>
