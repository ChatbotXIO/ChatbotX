import { z } from "zod"

/**
 * Partial update of the Meta calling settings — only provided fields are
 * sent to `/{phone-number-id}/settings`, mirroring Meta's merge semantics.
 */
export const updateWhatsappCallingSettingsSchema = z.object({
  status: z.enum(["ENABLED", "DISABLED"]).optional(),
  callIconVisibility: z.enum(["DEFAULT", "DISABLE_ALL"]).optional(),
  callbackPermissionStatus: z.enum(["ENABLED", "DISABLED"]).optional(),
  /**
   * Routes the number's calls through the platform's LiveKit SIP bridge
   * (in-app calling, beta). The SIP hostname comes from server env, never
   * from client input.
   */
  sipEnabled: z.boolean().optional(),
  /** Local DB flag (no Meta call): auto-record in-app calls on this number. */
  recordingEnabled: z.boolean().optional(),
})

export type UpdateWhatsappCallingSettingsSchema = z.infer<
  typeof updateWhatsappCallingSettingsSchema
>
