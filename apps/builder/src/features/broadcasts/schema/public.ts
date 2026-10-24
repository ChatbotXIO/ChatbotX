import { broadcastEventType } from "@chatbotx.io/analytics/schemas"
import {
  broadcastOccurrenceOutcomes,
  broadcastOccurrenceReasons,
  broadcastScheduleTypes,
  broadcastSendLimitSchema,
  broadcastStatuses,
  broadcastSubactions,
  channelTypes,
  isAudienceRangeOrdered,
  occurrenceBucketGranularities,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { recurrenceRuleSchema } from "@chatbotx.io/utils/recurrence"
import { z } from "zod"
import { strictContactFilter } from "@/features/contacts/schema/public/crud"
import {
  countModeRequestShape,
  countResultShape,
} from "@/features/contacts/schema/query"
import { publicListRequest } from "@/lib/public-api/list"
import {
  broadcastRunDateSchema,
  broadcastTargetSchema,
  createBroadcastFields,
  withBroadcastRules,
} from "./action"

// `listBroadcastContactsRequest`/`Response` in `@chatbotx.io/analytics/schemas`
// carry `workspaceId` (injected from the token's resolved workspace, never
// accepted from client input) and `conversationId` (an internal builder-
// navigation detail, not a public API concern) — narrow variants declared
// here instead of reusing those directly, mirroring `analytics/schema/public.ts`.
export const publicListBroadcastContactsRequest = z.object({
  id: zodBigintAsString().describe(
    "Broadcast id. Get it from `broadcasts.list`.",
  ),
  eventType: broadcastEventType.describe(
    "Event to filter recipients by: `message:sent`, `message:delivered`, `message:seen`, `message:failed` or `flow:clicked`. `message:received` and `flow:ref` are accepted but not tracked per recipient, so they return the same list as `message:delivered`.",
  ),
  page: publicListRequest.shape.page,
  perPage: publicListRequest.shape.perPage,
})

export const publicBroadcastContactResource = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: channelTypes,
  errorContent: z.string().nullable(),
  occurredAt: z.string(),
  conversationId: z
    .string()
    .describe(
      "Conversation of this contact inbox. Use it with `messages.create` to reply.",
    ),
})

export const publicListBroadcastContactsResponse = z.object({
  data: z.array(publicBroadcastContactResource),
  total: z
    .number()
    .int()
    .describe("Number of recipients that reached this event, across pages."),
  pageCount: z.number().int(),
})

/** A query-string boolean: only the literal `true` / `false` are accepted. */
const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

export const listBroadcastsPublicRequest = publicListRequest.extend({
  status: broadcastStatuses
    .optional()
    .describe("Restrict to broadcasts in this status."),
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the broadcast name."),
  channel: channelTypes
    .optional()
    .describe("Restrict to broadcasts sent on this channel."),
  scheduledFrom: z.coerce
    .date()
    .optional()
    .describe("Only broadcasts scheduled at or after this time (ISO 8601)."),
  scheduledTo: z.coerce
    .date()
    .optional()
    .describe("Only broadcasts scheduled at or before this time (ISO 8601)."),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `createdAt`, `schedulesAt`, `name`. Defaults to newest first.",
    ),
  schedulesType: broadcastScheduleTypes
    .optional()
    .describe(
      "Restrict to one schedule type. `recurring` lists the repeating broadcasts themselves.",
    ),
  parentBroadcastId: zodBigintAsString()
    .optional()
    .describe(
      "Only the runs of this repeating broadcast. Get its id from `broadcasts.list` with `schedulesType: recurring`; combine with `scheduledFrom`/`scheduledTo` for one period.",
    ),
  includeRuns: booleanQuery
    .optional()
    .describe(
      "`false` hides the runs of repeating broadcasts, leaving one-offs and the repeating broadcasts. Defaults to `true`.",
    ),
  excludeTemplates: booleanQuery
    .optional()
    .describe(
      "`true` hides the repeating broadcasts themselves (they never send on their own), leaving one-offs and runs. Defaults to `false`.",
    ),
})

/**
 * Audience selectors shared by the pre-send count and preview. They mirror the
 * audience part of `broadcasts.create`, so a caller can try a filter first and
 * then create the broadcast with the same values.
 */
const broadcastAudiencePublicShape = {
  inboxIds: z
    .array(zodBigintAsString())
    .optional()
    .describe(
      "Inbox ids (numeric strings) the broadcast would send from. Get them from `inboxes.list`. Pick the audience with `inboxIds`, or with `channels` (`omnichannel` means every channel), or with an integration id; when you give none of them the audience is empty.",
    ),
  channels: z
    .array(channelTypes)
    .optional()
    .describe(
      "Channels to send on; `omnichannel` means every channel. Needed when `inboxIds` is omitted.",
    ),
  integrationWhatsappId: zodBigintAsString()
    .optional()
    .describe(
      "Only inboxes of this WhatsApp integration id. Get it from `whatsappChannels.list`.",
    ),
  integrationMessengerId: zodBigintAsString()
    .optional()
    .describe(
      "Only inboxes of this Messenger integration id. Get it from `messengerChannels.list`.",
    ),
  subaction: broadcastSubactions
    .optional()
    .describe(
      "Audience sub-action filter, the same value `broadcasts.create` takes.",
    ),
  contactFilter: strictContactFilter,
  audienceRangeStart:
    broadcastSendLimitSchema.shape.audienceRangeStart.describe(
      "1-based inclusive start of the ordered audience window (ascending contact inbox id). Omit to start from the first contact.",
    ),
  audienceRangeEnd: broadcastSendLimitSchema.shape.audienceRangeEnd.describe(
    "1-based inclusive end of the ordered audience window. Omit to include through the last contact.",
  ),
}

export const previewBroadcastAudiencePublicRequest = z
  .object({
    ...broadcastAudiencePublicShape,
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Page number, starting at 1. Defaults to 1."),
    perPage: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Rows per page, 1-50. Defaults to 20."),
    countMode: countModeRequestShape.countMode,
  })
  .refine(isAudienceRangeOrdered, {
    path: ["audienceRangeEnd"],
    message: "`audienceRangeEnd` must not be before `audienceRangeStart`",
  })

export const previewBroadcastAudiencePublicResponse = z.object({
  total: z
    .number()
    .describe(
      "Size of the whole audience (the audience window applied), not just this page. A contact on several channels counts once per channel. A lower bound when `totalCountCapped` is true.",
    ),
  ...countResultShape,
  data: z.array(
    z.object({
      contactId: z.string().describe("Contact id."),
      contactInboxId: z
        .string()
        .describe("Contact inbox id (one per contact per channel)."),
      firstName: z.string().nullable().describe("Contact first name."),
      lastName: z.string().nullable().describe("Contact last name."),
      fullName: z.string().nullable().describe("Contact full name."),
      avatar: z
        .string()
        .nullable()
        .describe("Absolute avatar URL, or null when the contact has none."),
      occurredAt: z
        .string()
        .nullable()
        .describe("ISO 8601 time the contact was created."),
      channel: channelTypes.describe("Channel of this contact inbox."),
      conversationId: z
        .string()
        .nullable()
        .describe("Direct-message conversation id, or null when none exists."),
    }),
  ),
})

const templateParamsField = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    'Template values by key, e.g. `{"body.1": "Ann", "header": "https://.../a.jpg"}`. The keys are the `parameters` of `whatsappTemplates.get` / `messengerTemplates.get`. Use this or `templateData`, not both; a missing, unknown or invalid key is a 422 that lists the keys.',
  )

const hasParamsAndData = (entry: {
  templateParams?: Record<string, string>
  templateData?: unknown
}) => Boolean(entry.templateParams && entry.templateData)

/**
 * `createBroadcastRequest` plus flat `templateParams` (top level and per
 * target), so an API caller can fill a template by key instead of building
 * Meta's nested `templateData`. Same rules as the builder's request.
 */
export const createBroadcastPublicRequest = withBroadcastRules(
  createBroadcastFields.extend({
    templateParams: templateParamsField,
    targets: z
      .array(
        broadcastTargetSchema.extend({ templateParams: templateParamsField }),
      )
      .optional()
      .describe(
        "Per-page targets for a multi-page broadcast, each with its own template/flow.",
      ),
  }),
).refine(
  (data) =>
    !(hasParamsAndData(data) || (data.targets ?? []).some(hasParamsAndData)),
  {
    message: "Send templateParams or templateData, not both",
    path: ["templateParams"],
  },
)
export type CreateBroadcastPublicRequest = z.infer<
  typeof createBroadcastPublicRequest
>

export const previewRecurrencePublicRequest = z.object({
  recurrence: recurrenceRuleSchema.describe(
    "The repeat rule to preview, the same object `broadcasts.create` takes.",
  ),
  count: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe("How many upcoming runs to return, 1-10. Defaults to 3."),
})

export const previewRecurrencePublicResponse = z.object({
  upcomingRuns: z
    .array(z.string())
    .describe("ISO 8601 times of the next runs, soonest first."),
  timezone: z.string().describe("The IANA timezone the rule runs in."),
  weekStartsOn: z
    .literal("monday")
    .describe("Weeks are ISO weeks, starting on Monday."),
})

const SKIP_RUNS_PER_CALL_MAX = 100

export const setBroadcastOccurrenceSkippedPublicRequest = z
  .object({
    id: zodBigintAsString().describe(
      "Id of a repeating broadcast. Get it from `broadcasts.list` with `schedulesType: recurring`.",
    ),
    dates: z
      .array(broadcastRunDateSchema)
      .max(SKIP_RUNS_PER_CALL_MAX)
      .optional()
      .describe(
        "Local dates (YYYY-MM-DD) of the runs, in the broadcast's own timezone (`recurrence.rule.timezone`).",
      ),
    occurrenceAts: z
      .array(z.coerce.date())
      .max(SKIP_RUNS_PER_CALL_MAX)
      .optional()
      .describe(
        "Runs named by their time (ISO 8601), exactly as listed in `recurrence.upcomingRuns` of `broadcasts.get` or `broadcasts.previewRecurrence`; no timezone conversion needed. Combine with `dates` if you like.",
      ),
  })
  .refine(
    (input) =>
      (input.dates?.length ?? 0) + (input.occurrenceAts?.length ?? 0) > 0,
    { message: "Give at least one date or occurrenceAt.", path: ["dates"] },
  )

export const setBroadcastOccurrenceSkippedPublicResponse = z.object({
  excludeDates: z
    .array(z.string())
    .describe("All skipped local dates of the series, oldest first."),
  nextSendAt: z
    .date()
    .nullable()
    .describe(
      "The next run that will really send; null when paused or only skipped dates remain.",
    ),
  upcomingRuns: z
    .array(z.string())
    .describe("ISO 8601 times of the next runs that will send."),
})

const runGranularity = z.enum(occurrenceBucketGranularities)

export const listBroadcastRunGroupsPublicRequest = z.object({
  idOrName: z
    .string()
    .describe(
      "Id (numeric string) or exact name of a repeating broadcast. Get it from `broadcasts.list` with `schedulesType: recurring`.",
    ),
  groupBy: runGranularity
    .default("day")
    .describe("Group the slots by local `day`, ISO `week` or `month`."),
  timezone: z
    .string()
    .optional()
    .describe(
      "IANA timezone to group in. Defaults to the broadcast's own timezone; an unknown name falls back to it.",
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(31)
    .default(31)
    .describe("Groups per page, 1-31."),
  cursor: z
    .string()
    .optional()
    .describe("`nextCursor` of the previous page. Omit for the first page."),
})

const runStatsResource = z
  .record(z.string(), z.number())
  .describe(
    "Recipient counts by event: `message:sent`, `message:delivered`, `message:seen`, `flow:clicked`, `message:failed`.",
  )

export const listBroadcastRunGroupsPublicResponse = z.object({
  data: z.array(
    z.object({
      periodStart: z
        .string()
        .describe("First local day of the group, YYYY-MM-DD."),
      periodEnd: z
        .string()
        .describe("First local day after the group (exclusive)."),
      periodStartAt: z
        .string()
        .describe(
          "`periodStart` as an ISO 8601 instant (local midnight in `timezone`). Pass it as `from` to `broadcasts.listOccurrences`.",
        ),
      periodEndAt: z
        .string()
        .describe(
          "`periodEnd` as an ISO 8601 instant (exclusive). Pass it as `to` to `broadcasts.listOccurrences`; for `broadcasts.list` use the instant just before it as `scheduledTo`, which is inclusive.",
        ),
      slotCount: z.number().int().describe("Scheduled slots in the group."),
      createdCount: z.number().int().describe("Slots that became a run."),
      skippedCount: z
        .number()
        .int()
        .describe("Slots deliberately not sent (see `reasonCounts`)."),
      missedCount: z
        .number()
        .int()
        .describe("Slots lost to an outage; a later slot was sent instead."),
      reasonCounts: z
        .partialRecord(broadcastOccurrenceReasons, z.number().int())
        .describe("Skipped and missed slots by reason."),
      runStateCounts: z
        .record(z.string(), z.number().int())
        .describe("Runs by status, e.g. `sent`, `failed`, `scheduled`."),
      stats: runStatsResource,
    }),
  ),
  nextCursor: z.string().nullable(),
  totalSlots: z.number().int(),
  totalRuns: z.number().int().describe("Runs created over the series' life."),
  timezone: z.string(),
  weekStartsOn: z.literal("monday"),
})

export const listBroadcastOccurrencesPublicRequest = z.object({
  idOrName: z
    .string()
    .describe(
      "Id (numeric string) or exact name of a repeating broadcast. Get it from `broadcasts.list` with `schedulesType: recurring`.",
    ),
  from: z.coerce
    .date()
    .optional()
    .describe("Only slots at or after this time (ISO 8601)."),
  to: z.coerce
    .date()
    .optional()
    .describe("Only slots before this time (ISO 8601)."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Slots per page, 1-100."),
  cursor: z
    .string()
    .optional()
    .describe("`nextCursor` of the previous page. Omit for the first page."),
})

export const listBroadcastOccurrencesPublicResponse = z.object({
  data: z.array(
    z.object({
      localSlot: z
        .string()
        .describe("The slot in the schedule's timezone, `YYYY-MM-DD HH:mm`."),
      occurrenceAt: z.date().describe("The slot as an instant."),
      outcome: broadcastOccurrenceOutcomes.describe(
        "`created`: a run exists. `skipped`: deliberately not sent. `missed`: lost to an outage.",
      ),
      reason: broadcastOccurrenceReasons
        .nullable()
        .describe(
          "Why a slot was not sent. `catchUpSuperseded`: the platform was down and a later slot was sent instead. `paused` / `draft`: the schedule was off.",
        ),
      latenessMs: z
        .number()
        .int()
        .describe("How long after the slot it was handled."),
      supersededCount: z
        .number()
        .int()
        .describe(
          "More than 1 only on a row that stands for several older slots.",
        ),
      run: z
        .object({
          id: z
            .string()
            .describe("The run's broadcast id; works with `broadcasts.get`."),
          status: z.string(),
          contactCount: z.number().int().nullable(),
          isStalled: z
            .boolean()
            .describe("Still `scheduled` long after its slot."),
          stats: runStatsResource.optional(),
        })
        .nullable()
        .describe("The run this slot created; null when it was not sent."),
    }),
  ),
  nextCursor: z.string().nullable(),
})
