import {
  type ContactTouchpointKind,
  contactTouchpointDetailsSchemas,
  contactTouchpointKinds,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

/**
 * One rule per kind, shown in the OpenAPI description of the item so an agent
 * knows what a row means, how it is counted and how long it is kept.
 */
export const CONTACT_TOUCHPOINT_KIND_RULES: Record<
  ContactTouchpointKind,
  string
> = {
  inboxSource:
    "How a conversation with the contact started: one row per connection the contact has with an inbox, at its first interaction (the connection's creation time when none was recorded). `details.source` is `direct`, `comment` and so on.",
  postComment:
    "A post the contact commented on: one row per post across all of the contact's connections, at the earliest comment. Removed posts are left out.",
  minigame:
    "A minigame the contact opened: one row per game, at the latest play (the time it was opened when never played). `details.played` is the plays used and `lastPrizeName` / `lastWon` describe the latest play.",
  leaderboard:
    "A leaderboard the contact scores on: one row per live board (deleted boards are left out), at the contact's last activity. `details.score` is the current score.",
  questionnaire:
    "A questionnaire the contact answered: one row per questionnaire, at the latest completion (or at the start of the attempt in progress when none completed). `details.submissions` counts completed and in-progress attempts; cancelled, failed and timed-out attempts are left out.",
  miniApp:
    "A Mini App the contact submitted: one row per app, at the latest submission. `details.submissions` is the exact number of submissions.",
  poll: "A poll the contact voted in: one row per poll, at the latest vote (a re-vote replaces the previous one). `details.candidateName` is the current choice.",
  leadForm:
    "A lead form (Facebook Lead Ads) the contact filled in: one row per lead automation, at the latest lead. `details.leads` is the exact number of leads.",
  inboundWebhook:
    "An inbound webhook that saved the contact: one row per webhook, at the latest request that was processed or completed with errors. `details.requests` counts those requests still in the request log, which keeps 30 days.",
  commentAutomation:
    "A comment automation that replied to the contact: one row per automation, at the latest reply. `details.replies` is the exact number of events, and `details.automationType` the channel family of the automation.",
  refLink:
    "A ref link or QR code the contact came in through: one row per link, at the latest visit. `details.visits` is the exact number of visits and `details.linkType` is `refLink` or `qrCode`.",
  magicLink:
    "A magic link the contact clicked: one row per link, at the latest click. `details.clicks` is the exact number of clicks.",
  form: "A form the contact completed (a WhatsApp Flow today): one row per form, at the first completion since activity tracking began.",
}

const touchpointResource = <Kind extends ContactTouchpointKind>(kind: Kind) =>
  z.object({
    kind: z.literal(kind).describe(CONTACT_TOUCHPOINT_KIND_RULES[kind]),
    resourceKey: z
      .string()
      .describe(
        "Id of the tool item (the minigame, the link, ...). Unique within a kind, so `kind` + `resourceKey` identifies a row.",
      ),
    resourceName: z
      .string()
      .nullable()
      .describe("Name of the tool item; for a post, the start of its caption."),
    occurredAt: z
      .date()
      .describe("The time that places the row in the feed (see `kind`)."),
    channel: z
      .string()
      .nullable()
      .describe("Channel of the connection or post, when the row has one."),
    inboxId: z
      .string()
      .nullable()
      .describe("Inbox of the connection or post, when the row has one."),
    details: contactTouchpointDetailsSchemas[kind],
  })

export const contactTouchpointResource = z.discriminatedUnion("kind", [
  touchpointResource("inboxSource"),
  touchpointResource("postComment"),
  touchpointResource("minigame"),
  touchpointResource("leaderboard"),
  touchpointResource("questionnaire"),
  touchpointResource("miniApp"),
  touchpointResource("poll"),
  touchpointResource("leadForm"),
  touchpointResource("inboundWebhook"),
  touchpointResource("commentAutomation"),
  touchpointResource("refLink"),
  touchpointResource("magicLink"),
  touchpointResource("form"),
])
export type ContactTouchpointResource = z.infer<
  typeof contactTouchpointResource
>

/** Splits CSV entries and drops blanks; repeated params arrive as an array. */
const normalizeKinds = (
  value: string | string[] | undefined,
): string[] | undefined => {
  if (value === undefined) {
    return
  }
  const entries = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length > 0 ? [...new Set(entries)] : undefined
}

export const listContactTouchpointsRequest = z.object({
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of touchpoints per page."),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination cursor from a previous response. Omit for the first page.",
    ),
  kinds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(normalizeKinds)
    .pipe(z.array(contactTouchpointKinds).optional())
    .describe(
      `Only these kinds. Repeat the parameter (\`kinds=poll&kinds=minigame\`) or separate with commas (\`kinds=poll,minigame\`). One of: ${contactTouchpointKinds.options.join(", ")}. Omit for every kind.`,
    ),
})

export const listContactTouchpointsResponse = z.object({
  data: z.array(contactTouchpointResource),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next page; null on the last page."),
})
export type ListContactTouchpointsResponse = z.infer<
  typeof listContactTouchpointsResponse
>
