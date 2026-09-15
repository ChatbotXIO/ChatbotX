import { z } from "zod"

/**
 * Partial update of the Meta calling settings — only provided fields are
 * sent to `/{phone-number-id}/settings`, mirroring Meta's merge semantics.
 */
export const updateWhatsappCallingSettingsSchema = z.object({
  status: z.enum(["ENABLED", "DISABLED"]).optional(),
  callIconVisibility: z.enum(["DEFAULT", "DISABLE_ALL"]).optional(),
  callbackPermissionStatus: z.enum(["ENABLED", "DISABLED"]).optional(),
  /** Local DB flag (no Meta call): auto-record in-app calls on this number. */
  recordingEnabled: z.boolean().optional(),
  /** Retention window for recordings, in days (default 90). */
  callRecordingRetentionDays: z.number().int().min(1).max(3650).optional(),
  /** Local DB flag (no Meta call): opt-in per-integration transcription (default false). */
  callTranscriptionEnabled: z.boolean().optional(),
})

export type UpdateWhatsappCallingSettingsSchema = z.infer<
  typeof updateWhatsappCallingSettingsSchema
>
