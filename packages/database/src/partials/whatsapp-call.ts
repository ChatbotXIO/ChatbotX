import { z } from "zod"

export const whatsappCallDirections = z.enum([
  "userInitiated",
  "businessInitiated",
])
export type WhatsappCallDirection = z.infer<typeof whatsappCallDirections>

/**
 * Lifecycle statuses from Meta's `calls` webhook field.
 * `ringing`/`accepted`/`rejected` arrive on Call Status webhooks;
 * `completed`/`failed` arrive on the terminal Call Terminate webhook. A user-
 * initiated call never accepted terminates as `failed` — the UI derives "missed
 * call" from that combination.
 */
export const whatsappCallStatuses = z.enum([
  "ringing",
  "accepted",
  "rejected",
  "completed",
  "failed",
])
export type WhatsappCallStatus = z.infer<typeof whatsappCallStatuses>

/** A terminal status — a row in one of these can never be resurrected into `ringing`/`accepted`. */
export type WhatsappCallTerminalStatus = Extract<
  WhatsappCallStatus,
  "rejected" | "completed" | "failed"
>

/**
 * Display outcome persisted alongside every terminal `status` write. `canceled`
 * is a DISPLAY-only refinement of DB `status: "failed"` for a business-
 * initiated call the agent hung up before the customer answered — never a
 * status value of its own.
 */
export const whatsappCallOutcomes = z.enum([
  "completed",
  "failed",
  "rejected",
  "canceled",
])
export type WhatsappCallOutcome = z.infer<typeof whatsappCallOutcomes>

/**
 * The outcome value(s) compatible with each terminal status — `failed` is the
 * only status with two possible outcomes. Used to type-narrow every terminal
 * writer's `{ status, outcome }` pair so a mismatched pair is a compile error,
 * not a runtime bug.
 */
export type WhatsappCallOutcomeByFinalStatus = {
  failed: Extract<WhatsappCallOutcome, "failed" | "canceled">
  rejected: Extract<WhatsappCallOutcome, "rejected">
  completed: Extract<WhatsappCallOutcome, "completed">
}

/**
 * A terminal `{ status, outcome }` pair, distributed over
 * `WhatsappCallTerminalStatus` so every terminal writer is rejected at compile
 * time for a mismatched pair or an omitted `outcome`.
 */
export type WhatsappCallTerminalStatusOutcomePair = {
  [S in WhatsappCallTerminalStatus]: {
    status: S
    outcome: WhatsappCallOutcomeByFinalStatus[S]
  }
}[WhatsappCallTerminalStatus]

/** The outcome each terminal status resolves to when the call was NOT a business cancel. */
export const OUTCOME_BY_TERMINAL_STATUS: Record<
  WhatsappCallTerminalStatus,
  WhatsappCallOutcome
> = {
  completed: "completed",
  rejected: "rejected",
  failed: "failed",
}

/**
 * Single place the "agent hung up an outbound call before the customer
 * answered" cancel rule lives, so every writer derives `outcome` the same way.
 */
export const resolveWhatsappCallOutcome = <
  S extends WhatsappCallTerminalStatus,
>(
  input: {
    status: S
    /** True only for a business-initiated call the agent ended before the customer answered. */
    canceledByBusiness?: boolean
  },
  // Generic over the caller's (often literal) status type so the return narrows
  // to `WhatsappCallOutcomeByFinalStatus[S]` — a literal `status: "completed"`
  // resolves to the single literal `"completed"`, letting a caller spread `{
  // status, outcome: resolveWhatsappCallOutcome({ status }) }` into a
  // `WhatsappCallTerminalStatusOutcomePair`-typed parameter.
): WhatsappCallOutcomeByFinalStatus[S] =>
  (input.status === "failed" && input.canceledByBusiness
    ? "canceled"
    : OUTCOME_BY_TERMINAL_STATUS[
        input.status
      ]) as WhatsappCallOutcomeByFinalStatus[S]

/**
 * Same as `resolveWhatsappCallOutcome`, but returns the full `{ status, outcome }`
 * pair — for callers (e.g. `endVoipCallAsAgent`'s wacid branch) where `status` is
 * only known as the broad `WhatsappCallTerminalStatus`, so building the pair by
 * hand is a compile error; the exhaustive switch below narrows per-branch instead.
 */
export const resolveWhatsappCallTerminalOutcomePair = (input: {
  status: WhatsappCallTerminalStatus
  /** True only for a business-initiated call the agent ended before the customer answered. */
  canceledByBusiness?: boolean
}): WhatsappCallTerminalStatusOutcomePair => {
  switch (input.status) {
    case "completed":
      return { status: "completed", outcome: "completed" }
    case "rejected":
      return { status: "rejected", outcome: "rejected" }
    case "failed":
      return {
        status: "failed",
        outcome: input.canceledByBusiness ? "canceled" : "failed",
      }
    default:
      return input.status satisfies never
  }
}

/** `coalesce(outcome, status)` for terminal rows; `null` while ringing/accepted. */
export const resolveDisplayCallOutcome = (row: {
  status: WhatsappCallStatus
  outcome: WhatsappCallOutcome | null
}): WhatsappCallOutcome | null => {
  if (row.outcome) {
    return row.outcome
  }
  return row.status in OUTCOME_BY_TERMINAL_STATUS
    ? (row.status as WhatsappCallOutcome)
    : null
}

/** A contact's answer to a business-calling permission request. */
export const whatsappCallPermissionResponses = z.enum(["accept", "reject"])
export type WhatsappCallPermissionResponse = z.infer<
  typeof whatsappCallPermissionResponses
>

/**
 * Shape of one entry in `WhatsappCall.transcriptSegments` (jsonb array); source of
 * truth for the column's `$type<>` in `schema/whatsapp-call.ts`. `speaker`/`channel`
 * are present only for Meta-native transcription (browserWhisper has no diarization,
 * so it omits both, never `null`). `start`/`end` are seconds, matching Meta's units.
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
 * from the diarized/flat transcript by a connected AI integration. Single
 * source of truth for the column's `$type<>` in `schema/whatsapp-call.ts`.
 */
export const whatsappCallAiSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
})
export type WhatsappCallAiSummary = z.infer<typeof whatsappCallAiSummarySchema>
