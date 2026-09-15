import { z } from "zod"

export const whatsappTemplateStatusSchema = z.enum([
  "APPROVED",
  "PENDING",
  "REJECTED",
])
export type WhatsappTemplateStatus = z.infer<
  typeof whatsappTemplateStatusSchema
>

export const whatsappTemplateCategories = z.enum(["MARKETING", "UTILITY"])
export type WhatsappTemplateCategory = z.infer<
  typeof whatsappTemplateCategories
>

export const whatsappRegistrationStatuses = z.enum([
  "pending_verification",
  "registered",
  "failed",
])
export type WhatsappRegistrationStatus = z.infer<
  typeof whatsappRegistrationStatuses
>

/**
 * Shape of `IntegrationWhatsapp.registrationError` (jsonb). Single source of
 * truth for the column's `$type<>` in `schema/integration-whatsapp.ts` — that
 * file derives `IntegrationWhatsappRegistrationError` from this schema
 * instead of hand-declaring the type, and the builder's connect flow
 * (`whatsappConnectExtraSchema`) validates the same shape it returns to the
 * client.
 */
export const whatsappRegistrationErrorSchema = z.object({
  code: z.union([z.string(), z.number()]),
  subCode: z.union([z.string(), z.number()]).nullable(),
  message: z.string(),
  type: z.string().optional(),
  userTitle: z.string().optional(),
  userMessage: z.string().optional(),
  fbtraceId: z.string().optional(),
  at: z.string(),
})
export type WhatsappRegistrationError = z.infer<
  typeof whatsappRegistrationErrorSchema
>

/**
 * Recording/transcription pipeline mode for WhatsApp calls (VoIP only).
 * `metaNative` (default): Meta's per-call `recording`/`transcription`
 * opt-in objects — diarized transcript, new Meta billing.
 * `browserWhisper`: the pre-existing browser MediaRecorder + OpenAI Whisper
 * pipeline, kept as a selectable fallback (flat/timestamped, no speaker
 * diarization, OpenAI cost).
 */
export const whatsappCallRecordingModes = z.enum([
  "metaNative",
  "browserWhisper",
])
export type WhatsappCallRecordingMode = z.infer<
  typeof whatsappCallRecordingModes
>

export const whatsappCallTranscriptionModes = z.enum([
  "metaNative",
  "browserWhisper",
])
export type WhatsappCallTranscriptionMode = z.infer<
  typeof whatsappCallTranscriptionModes
>
