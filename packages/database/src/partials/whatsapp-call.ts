import { z } from "zod"

export const whatsappCallDirections = z.enum([
  "userInitiated",
  "businessInitiated",
])
export type WhatsappCallDirection = z.infer<typeof whatsappCallDirections>

/**
 * Lifecycle statuses reported by Meta's `calls` webhook field.
 *
 * `ringing`/`accepted`/`rejected` arrive as Call Status webhooks while the
 * call is live; `completed`/`failed` arrive on the terminal Call Terminate
 * webhook. A user-initiated call that was never accepted terminates as
 * `failed` — the UI derives "missed call" from that combination.
 */
export const whatsappCallStatuses = z.enum([
  "ringing",
  "accepted",
  "rejected",
  "completed",
  "failed",
])
export type WhatsappCallStatus = z.infer<typeof whatsappCallStatuses>

/** A contact's answer to a business-calling permission request. */
export const whatsappCallPermissionResponses = z.enum(["accept", "reject"])
export type WhatsappCallPermissionResponse = z.infer<
  typeof whatsappCallPermissionResponses
>

/**
 * Shape of one entry in `WhatsappCall.transcriptSegments` (jsonb array).
 * Single source of truth for the column's `$type<>` in
 * `schema/whatsapp-call.ts`.
 *
 * `speaker`/`channel` are present ONLY for a VoIP call transcribed via
 * Meta-native transcription (`"Business"` / `"Customer"`, `channel` 0/1 per
 * Meta's `call_transcript` document) — a SIP/Whisper transcript has no
 * diarization, so those segments omit both fields entirely (never `null`,
 * to keep the shape a plain optional-property union rather than a
 * nullable one). `start`/`end` are seconds, matching Meta's
 * `call_transcript.transcript.segments[].start/end` units.
 */
export const whatsappCallTranscriptSegmentSchema = z.object({
  speaker: z.string().optional(),
  channel: z.number().int().optional(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
})
export type WhatsappCallTranscriptSegment = z.infer<
  typeof whatsappCallTranscriptSegmentSchema
>

export const whatsappCallTranscriptSegmentsSchema = z.array(
  whatsappCallTranscriptSegmentSchema,
)
export type WhatsappCallTranscriptSegments = z.infer<
  typeof whatsappCallTranscriptSegmentsSchema
>

/**
 * Shape of `WhatsappCall.aiSummary` (jsonb) — an on-demand summary generated
 * from the diarized/flat transcript by a connected AI integration.
 * Single source of truth for the column's `$type<>` in
 * `schema/whatsapp-call.ts`.
 */
export const whatsappCallAiSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
})
export type WhatsappCallAiSummary = z.infer<typeof whatsappCallAiSummarySchema>
