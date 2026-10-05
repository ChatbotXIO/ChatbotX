import { commentAutomationEventType } from "@chatbotx.io/analytics/schemas"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const MAX_BULK_CONTACT_IDS = 1000

export const bulkContactIdsPublicRequest = z.object({
  contactIds: z
    .array(zodBigintAsString())
    .min(1)
    .max(MAX_BULK_CONTACT_IDS)
    .describe(`Up to ${MAX_BULK_CONTACT_IDS} contact ids.`),
})
export type BulkContactIdsPublicRequest = z.infer<
  typeof bulkContactIdsPublicRequest
>

export const bulkAddTagsPublicRequest = bulkContactIdsPublicRequest.extend({
  tags: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(20)
    .describe(
      "Tag names — not ids. Existing tags whose name matches are reused; unmatched names are created.",
    ),
})
export type BulkAddTagsPublicRequest = z.infer<typeof bulkAddTagsPublicRequest>

export const bulkSubscribeSequencesPublicRequest =
  bulkContactIdsPublicRequest.extend({
    sequenceIds: z
      .array(zodBigintAsString())
      .min(1)
      .max(20)
      .describe(
        "Sequence ids (numeric strings) to subscribe the contacts to. Get them from `sequences.list`.",
      ),
  })
export type BulkSubscribeSequencesPublicRequest = z.infer<
  typeof bulkSubscribeSequencesPublicRequest
>

export const bulkUnsubscribeSequencesPublicRequest =
  bulkContactIdsPublicRequest.extend({
    sequenceIds: z
      .array(zodBigintAsString())
      .min(1)
      .max(20)
      .describe(
        "Sequence ids (numeric strings) to remove the contacts from. Get them from `sequences.list`.",
      ),
  })

export const bulkResultPublicResponse = z.object({
  processed: z
    .number()
    .describe("Number of contact ids that were found and processed."),
  skippedContactIds: z
    .array(z.string())
    .describe(
      "Contact ids from the request that were not found in this workspace (deleted, wrong workspace, or unknown) and were therefore skipped.",
    ),
})
export type BulkResultPublicResponse = z.infer<typeof bulkResultPublicResponse>

// `message:received` and `flow:ref` exist in the shared event enums but have no
// per-recipient predicate (the stats repositories treat them as `delivered`),
// so tagging by them would silently tag the delivered audience. Only the
// events that are really tracked are accepted here.
const trackedStatsEvent = z.enum([
  "message:sent",
  "message:delivered",
  "message:seen",
  "message:failed",
  "flow:clicked",
])

const statsTagFields = {
  tags: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(20)
    .describe(
      "Tag names — not ids. Existing tags whose name matches are reused; unmatched names are created.",
    ),
  excludedContactIds: z
    .array(zodBigintAsString())
    .default([])
    .describe(
      "Contact ids to leave out, e.g. contacts you reviewed and do not want tagged. Defaults to none.",
    ),
}

export const bulkTagByStatsPublicRequest = z.discriminatedUnion("source", [
  z.object({
    source: z
      .literal("broadcast")
      .describe("Tag the recipients of a broadcast delivery event."),
    broadcastId: zodBigintAsString().describe(
      "Broadcast id. Get it from `broadcasts.list`.",
    ),
    eventType: trackedStatsEvent.describe(
      "Event whose recipients are tagged: `message:sent`, `message:delivered`, `message:seen`, `message:failed` or `flow:clicked`, the values `broadcasts.listContacts` tracks.",
    ),
    ...statsTagFields,
  }),
  z.object({
    source: z
      .literal("sequenceStep")
      .describe("Tag the contacts behind a sequence step event."),
    sequenceId: zodBigintAsString().describe(
      "Sequence id. Get it from `sequences.list`.",
    ),
    stepId: zodBigintAsString().describe(
      "Step id inside that sequence. Get it from `sequences.get`.",
    ),
    eventType: trackedStatsEvent.describe(
      "Event whose contacts are tagged: `message:sent`, `message:delivered`, `message:seen`, `message:failed` or `flow:clicked`, the values `sequences.listStepContacts` tracks.",
    ),
    ...statsTagFields,
  }),
  z.object({
    source: z
      .literal("commentAutomation")
      .describe("Tag the commenters behind a comment automation event."),
    automationId: zodBigintAsString().describe(
      "Comment automation id. Get it from `fbComments.list` or `igComments.list`. An id that is not in this workspace tags nobody.",
    ),
    eventType: commentAutomationEventType.describe(
      "Event whose contacts are tagged, the same values `analytics.commentAutomationContacts` takes: `message:sent`, `message:delivered`, `message:seen`, `message:failed`, `flow:clicked` or `comment:missed`.",
    ),
    ...statsTagFields,
  }),
])

export const bulkTagByStatsPublicResponse = z.object({
  queued: z
    .boolean()
    .describe(
      "True when the tagging job was queued. It runs in the background, so tags appear on the contacts shortly after.",
    ),
})
