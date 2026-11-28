import {
  broadcastEventType,
  commentAutomationEventType,
  sequenceStepEventTypes,
} from "@chatbotx.io/analytics/schemas"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { tagResource } from "@/features/tags/schema/resource"

export const addContactTagRequest = z.object({
  ids: z.array(zodBigintAsString()),
  tags: z.array(z.string().trim().min(1)).min(1),
})
export type AddContactTagRequest = z.infer<typeof addContactTagRequest>

/** One tag on one contact, both by id (what the Inbox composer grid sends). */
export const contactTagByIdRequest = z.object({
  contactId: zodBigintAsString(),
  tagId: zodBigintAsString(),
})
export type ContactTagByIdRequest = z.infer<typeof contactTagByIdRequest>

const bulkTagNames = z.array(z.string().trim().min(1)).min(1)
const excludedContactIds = z.array(zodBigintAsString()).default([])

export const bulkTagStatsContactsRequest = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("broadcast"),
    broadcastId: zodBigintAsString(),
    eventType: broadcastEventType,
    excludedContactIds,
    tags: bulkTagNames,
  }),
  z.object({
    source: z.literal("sequenceStep"),
    sequenceId: zodBigintAsString(),
    stepId: zodBigintAsString(),
    eventType: sequenceStepEventTypes,
    excludedContactIds,
    tags: bulkTagNames,
  }),
  z.object({
    source: z.literal("commentAutomation"),
    automationId: zodBigintAsString(),
    eventType: commentAutomationEventType,
    excludedContactIds,
    tags: bulkTagNames,
  }),
])
export type BulkTagStatsContactsRequest = z.infer<
  typeof bulkTagStatsContactsRequest
>

export const removeContactTagsRequest = z.object({
  ids: z.array(zodBigintAsString()),
  tags: z.array(z.string().trim().min(1)).min(1),
})
export type RemoveContactTagsRequest = z.infer<typeof removeContactTagsRequest>

export const listContactTagsRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
})
export type ListContactTagsRequest = z.infer<typeof listContactTagsRequest>

export const listContactTagsResponse = z.object({
  data: z.array(tagResource),
})
export type ListContactTagsResponse = z.infer<typeof listContactTagsResponse>
