import {
  broadcastEventType,
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
])
export type BulkTagStatsContactsRequest = z.infer<
  typeof bulkTagStatsContactsRequest
>

export const updateContactTagRequest = z.object({
  contactId: zodBigintAsString(),
  tags: z.array(z.string().trim()),
})
export type UpdateContactTagRequest = z.infer<typeof updateContactTagRequest>

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

export const removeContactTagRequest = z.object({
  contactId: zodBigintAsString(),
  tagId: zodBigintAsString(),
})
export type RemoveContactTagRequest = z.infer<typeof removeContactTagRequest>
