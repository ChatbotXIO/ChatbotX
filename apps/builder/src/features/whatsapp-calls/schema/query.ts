import type { WhatsappCallActivityChip } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { createSearchParamsCache, parseAsStringLiteral } from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"

/**
 * P5 item 6 — the Calls page's base activity chips (plan D9: "Missed" and
 * "No reply"), matching `WhatsappCallActivityChip`
 * (`@chatbotx.io/business`'s `history-service.ts`). Duplicated here as a
 * plain literal tuple (not re-exported from business) because a `nuqs`
 * parser needs a `readonly [string, ...string[]]` it can inspect at import
 * time — importing the business type would only give the TS shape, not a
 * runtime value. `satisfies` (L4 fix, not a cast) keeps this tuple checked
 * AGAINST `WhatsappCallActivityChip` — TypeScript flags this array the
 * moment it drifts from the business type (missing/extra/misspelled chip),
 * while still narrowing to the literal tuple type `parseAsStringLiteral`
 * needs.
 */
export const CALL_ACTIVITY_CHIPS = [
  "missed",
  "noReply",
] as const satisfies readonly WhatsappCallActivityChip[]

/**
 * M1 — single source of truth for the `activity` URL param, shared between
 * the server-side search params cache below and `CallsPageClient`'s
 * `useQueryState` (parsers from `nuqs/server` resolve to the same
 * underlying parser objects `nuqs`'s client hooks accept — same pattern as
 * `features/broadcasts/schema/search-parsers.ts`).
 */
export const activityQueryParser = parseAsStringLiteral(CALL_ACTIVITY_CHIPS)

/**
 * Item 6 gap closure (plan §5's "agent filter … admin-only" + inbox select) —
 * B-H1 fix (Fable review): BOTH ids are bigint-as-string ids, but unlike the
 * `listWhatsappCallsAction` path (validated by `zodBigintAsString` at the
 * `bindArgsSchemas`/`inputSchema` boundary), `page.tsx` passes this cache's
 * parsed value straight to `listWhatsappCalls` with no zod validation of its
 * own. A plain `parseAsString` let a non-numeric value (`?inboxId=abc`)
 * reach `whatsappCallHistoryService.list` and fail as a bigint comparison in
 * Postgres (22P02) — an unhandled RSC 500. `parseAsBigInt` (the existing
 * shared digit-validated parser, already used for e.g. `folderId` in
 * `features/triggers/schema/query.ts`) resolves a non-numeric value to
 * `null` instead of throwing, which `page.tsx`'s `?? undefined` already
 * turns into "no filter" — same parser object shared with
 * `CallsPageClient`'s `useQueryStates`, so server and client can never
 * disagree on what counts as a valid id.
 */
export const inboxIdQueryParser = parseAsBigInt
export const agentUserIdQueryParser = parseAsBigInt

export const listWhatsappCallsSearchParamsCache = createSearchParamsCache({
  activity: activityQueryParser,
  inboxId: inboxIdQueryParser,
  agentUserId: agentUserIdQueryParser,
})

export const listWhatsappCallsRequest = z.object({
  workspaceId: zodBigintAsString(),
  activity: z.enum(CALL_ACTIVITY_CHIPS).optional(),
  inboxId: zodBigintAsString().optional(),
  /** Ignored by the service unless the caller's resolved scope is `allCalls` (D4). */
  agentUserId: zodBigintAsString().optional(),
  /** Opaque `{ createdAt, id }` cursor, base64-encoded — see `@/lib/pagination`. */
  cursor: z.string().optional(),
})
export type ListWhatsappCallsRequest = z.infer<typeof listWhatsappCallsRequest>

/**
 * H1 fix: `createdAt` is the row's full-precision TEXT rendering of a
 * `timestamptz(6)` value, never a `Date` (which only holds millisecond
 * precision and would silently truncate the cursor on decode) — see
 * `WhatsappCallListCursor` in `@chatbotx.io/database/repositories`. Refined
 * to a value `Date.parse` can actually parse so a tampered/malformed cursor
 * fails `decodeCursor` cleanly instead of reaching the repository as an
 * un-castable string.
 */
export const whatsappCallListCursorSchema = z.object({
  createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  id: zodBigintAsString(),
})
