import {
  parseThreadControlRole,
  type ThreadControlEvent,
  threadControlEvents,
} from "@chatbotx.io/database/partials"
import { threadControlContextSchema } from "@chatbotx.io/sdk"
import type { useTranslations } from "next-intl"
import { z } from "zod"
import { resolveThreadOwnerLabel } from "@/features/conversations/utils/thread-control"

/**
 * Client-side readers of the conversation-routing rows the thread-control
 * service writes (`packages/business/src/thread-control`): an activity
 * divider per state change and a context card per handover. Parsed leniently:
 * an unknown shape renders as a plain message instead of crashing the list.
 */

const threadControlActivitySchema = z.object({
  type: z.literal("threadControl"),
  event: threadControlEvents,
  ownerRole: z.string().nullish(),
  previousOwnerRole: z.string().nullish(),
})
export type ThreadControlActivity = z.infer<typeof threadControlActivitySchema>

// A handover carries a `conversation_context` (summary/history), a `metadata`
// note, or both — Meta omits the context when the new owner had standby access
// but may still send the note. The card must render with either present, so
// `context` is optional and at least one of the two is required.
const threadControlContextCardSchema = z
  .object({
    type: z.literal("threadControlContext"),
    context: threadControlContextSchema.optional(),
    handoverNote: z.string().nullish(),
  })
  .refine((card) => card.context !== undefined || Boolean(card.handoverNote))
export type ThreadControlContextCard = z.infer<
  typeof threadControlContextCardSchema
>

export const getThreadControlActivity = (
  contentAttributes: unknown,
): ThreadControlActivity | undefined =>
  threadControlActivitySchema.safeParse(contentAttributes).data

export const getThreadControlContextCard = (
  contentAttributes: unknown,
): ThreadControlContextCard | undefined =>
  threadControlContextCardSchema.safeParse(contentAttributes).data

/** A partner's message seen on the standby feed (listen-only echo). */
export const isThreadControlEcho = (contentAttributes: unknown): boolean =>
  typeof contentAttributes === "object" &&
  contentAttributes !== null &&
  (contentAttributes as { threadControlEcho?: unknown }).threadControlEcho ===
    true

/** Divider text per routing event (plan §3.7.6); the stored text is only a fallback. */
const DIVIDER_KEYS = {
  standbyReceived: "conversationRouting.divider.ownerHandling",
  controlTaken: "conversationRouting.divider.ownerHandling",
  controlPassed: "conversationRouting.divider.handedOver",
  inboundReceived: "conversationRouting.divider.selfHandling",
  serviceSent: "conversationRouting.divider.selfHandling",
  taken: "conversationRouting.divider.takenOver",
  released: "conversationRouting.divider.released",
  passed: "conversationRouting.divider.passed",
  serviceRejected: "conversationRouting.divider.serviceRejected",
} as const satisfies Record<ThreadControlEvent, string>

/**
 * The localized sentence of a routing activity row, shared by the timeline
 * divider and the conversation-list preview. Owners named in it are always
 * the other responder (`standby` label), the brand is this app.
 */
export function formatThreadControlActivity(
  activity: ThreadControlActivity,
  t: ReturnType<typeof useTranslations>,
  brand: string,
): string {
  const owner = resolveThreadOwnerLabel(
    t,
    brand,
    "standby",
    parseThreadControlRole(activity.ownerRole),
  )
  const previousOwner = resolveThreadOwnerLabel(
    t,
    brand,
    "standby",
    parseThreadControlRole(activity.previousOwnerRole),
  )
  return t(DIVIDER_KEYS[activity.event], { brand, owner, previousOwner })
}
