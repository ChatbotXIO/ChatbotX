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

/** A terminal status — a row in one of these can never be resurrected into `ringing`/`accepted`. */
export type WhatsappCallTerminalStatus = Extract<
  WhatsappCallStatus,
  "rejected" | "completed" | "failed"
>

/**
 * Display outcome persisted alongside every terminal `status` write
 * (`resolveWhatsappCallOutcome`). `canceled` is the same DISPLAY-only
 * refinement `MessageWhatsappCallEntity["status"]` already uses for a
 * business-initiated call the agent hung up before the customer answered —
 * it is a refinement of the DB `status: "failed"`, never a status value of
 * its own.
 */
export const whatsappCallOutcomes = z.enum([
  "completed",
  "failed",
  "rejected",
  "canceled",
])
export type WhatsappCallOutcome = z.infer<typeof whatsappCallOutcomes>

/**
 * The outcome value(s) compatible with each terminal status — `failed` is
 * the only status with two possible outcomes. Used to type-narrow every
 * terminal writer's `{ status, outcome }` pair so a mismatched pair (e.g.
 * `rejected` + `completed`) is a compile error, not a runtime bug.
 */
export type WhatsappCallOutcomeByFinalStatus = {
  failed: Extract<WhatsappCallOutcome, "failed" | "canceled">
  rejected: Extract<WhatsappCallOutcome, "rejected">
  completed: Extract<WhatsappCallOutcome, "completed">
}

/**
 * A terminal `{ status, outcome }` pair, distributed over
 * {@link WhatsappCallTerminalStatus} so every terminal writer
 * (`finalizeById`, `finalizeEndedCall`) is rejected at compile time for a
 * mismatched pair or an omitted `outcome`.
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
 * Pure resolution of the display `outcome` from a terminal `status` — the
 * single place the "agent hung up an outbound call before the customer
 * answered" cancel rule lives, so every writer (the shared finalizer, both
 * `endVoipCallAsAgent` branches, outbound connect/setup failures, the stale
 * sweep, the signaling wrapper, the interim `rejected` branch) derives
 * `outcome` the same way.
 *
 * IMPORTANT for every READER of the persisted `outcome` column: a pod still
 * running the OLD image during the rollout of the migration pair that added
 * this column (`20260917173244_whatsapp_call_outcome_type_column` /
 * `20260917173245_whatsapp_call_outcome_backfill_index`) writes terminal
 * rows with `outcome` left `NULL` — there is no redelivery that would heal
 * them via `fillMissingTerminalFields`. Any reader (P5b's `CALL_KIND_RULES`,
 * list filters, etc.) MUST treat `NULL` as "fall back to `status`" —
 * `coalesce(outcome, status)` semantics — never read `outcome` alone. See
 * `docs/whatsapp-calling-voip.md`'s "Call outcome column" section.
 */
export const resolveWhatsappCallOutcome = <
  S extends WhatsappCallTerminalStatus,
>(
  input: {
    status: S
    /** True only for a business-initiated call the agent ended before the customer answered. */
    canceledByBusiness?: boolean
  },
  // Generic over the caller's (often literal) status type so the return
  // narrows to `WhatsappCallOutcomeByFinalStatus[S]` — e.g. a literal
  // `status: "completed"` resolves to the single literal `"completed"`, not
  // the broad `WhatsappCallOutcome` union, which is what lets a caller spread
  // `{ status, outcome: resolveWhatsappCallOutcome({ status }) }` into a
  // {@link WhatsappCallTerminalStatusOutcomePair}-typed parameter.
): WhatsappCallOutcomeByFinalStatus[S] =>
  (input.status === "failed" && input.canceledByBusiness
    ? "canceled"
    : OUTCOME_BY_TERMINAL_STATUS[
        input.status
      ]) as WhatsappCallOutcomeByFinalStatus[S]

/**
 * {@link resolveWhatsappCallOutcome}, but returning the full `{ status,
 * outcome }` pair rather than just `outcome` — for the one call site
 * (`endVoipCallAsAgent`'s wacid branch) where `status` is itself only known
 * at the broad {@link WhatsappCallTerminalStatus} type (threaded through
 * from `EndVoipCallResult.terminalStatus`). TypeScript is STRICTER here, not
 * looser: building `{ status, outcome }` by hand from a broad (union-typed)
 * `status` and assigning it to {@link WhatsappCallTerminalStatusOutcomePair}
 * is REJECTED at compile time, because with a non-literal discriminant
 * TypeScript cannot pick a single union branch to check the object literal
 * against. The exhaustive switch below sidesteps that by returning a
 * per-branch LITERAL pair from each case (where `status` — and therefore the
 * discriminant — narrows to a literal again), which the type checker CAN
 * verify against the union.
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

/**
 * P5 item 4/5 — the ONE reader helper implementing `coalesce(outcome,
 * status)` semantics (the rolling-deploy contract documented on
 * `resolveWhatsappCallOutcome` above): a legacy terminal row written before
 * the backfill/before an outcome-writing pod rolled out has `outcome ===
 * null`, and every reader (the Calls page's `CALL_KIND_RULES` /
 * `CALL_ACTIVITY_FILTERS`, the list repository's SQL where-builder) must
 * fall back to `status` rather than reading `outcome` alone. `status` is
 * only a valid stand-in for a TERMINAL row — `rejected`/`completed`/`failed`
 * are each a literal member of {@link WhatsappCallOutcome} too (`canceled`
 * has no status equivalent, by design: it is a DISPLAY-only refinement of
 * `failed`, never written to `status`). A non-terminal row (`ringing`/
 * `accepted`) has no display outcome at all — `null`.
 */
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
 * Shape of one entry in `WhatsappCall.transcriptSegments` (jsonb array).
 * Single source of truth for the column's `$type<>` in
 * `schema/whatsapp-call.ts`.
 *
 * `speaker`/`channel` are present ONLY for a VoIP call transcribed via
 * Meta-native transcription (`"Business"` / `"Customer"`, `channel` 0/1 per
 * Meta's `call_transcript` document) — a browserWhisper transcript has no
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
