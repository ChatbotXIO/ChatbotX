import type { WhatsappCallActivityChip } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { createSearchParamsCache, parseAsStringLiteral } from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"

/**
 * Duplicated as a literal tuple (not re-exported from business) because nuqs
 * needs a runtime readonly tuple, not just a TS type. `satisfies` keeps it
 * checked against WhatsappCallActivityChip so it can't drift.
 */
export const CALL_ACTIVITY_CHIPS = [
  "missed",
  "noReply",
] as const satisfies readonly WhatsappCallActivityChip[]

/**
 * Single source of truth for the activity URL param, shared between the server-
 * side search params cache below and CallsPageClient's useQueryState (parsers
 * from nuqs/server resolve to the same underlying parser objects nuqs's client
 * hooks accept).
 */
export const activityQueryParser = parseAsStringLiteral(CALL_ACTIVITY_CHIPS)

/**
 * page.tsx passes this cache's parsed value straight to listWhatsappCalls
 * with no validation of its own, so parseAsString would let a non-numeric
 * value (?inboxId=abc) fail as a bigint comparison in Postgres - an
 * unhandled RSC 500. parseAsBigInt resolves non-numeric input to null
 * instead, which page.tsx treats as "no filter".
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
  /** Ignored by the service unless the caller's resolved scope is allCalls. */
  agentUserId: zodBigintAsString().optional(),
  /** Opaque { createdAt, id } cursor, base64-encoded - see @/lib/pagination. */
  cursor: z.string().optional(),
})
export type ListWhatsappCallsRequest = z.infer<typeof listWhatsappCallsRequest>

/**
 * createdAt is the row's full-precision TEXT rendering of a timestamptz(6)
 * value, never a Date (which only holds millisecond precision and would
 * silently truncate the cursor on decode). Refined to a value Date.parse can
 * actually parse so a tampered/malformed cursor fails decodeCursor cleanly
 * instead of reaching the repository as an un-castable string.
 */
export const whatsappCallListCursorSchema = z.object({
  createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  id: zodBigintAsString(),
})
