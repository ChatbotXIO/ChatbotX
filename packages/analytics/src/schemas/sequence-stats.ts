import { z } from "zod"

export const sequenceStepEventType = z.enum([
  "sent",
  "delivered",
  "seen",
  "clicked",
  "failed",
])

export type SequenceStepEventType = z.infer<typeof sequenceStepEventType>

export const getSequenceStepStatsRequest = z.object({
  workspaceId: z.string(),
  sequenceId: z.string(),
  stepId: z.string(),
})

export type GetSequenceStepStatsRequest = z.infer<
  typeof getSequenceStepStatsRequest
>

export const getSequenceStepStatsResponse = z.object({
  sent: z.number(),
  delivered: z.number(),
  seen: z.number(),
  clicked: z.number(),
  failed: z.number(),
})

export type GetSequenceStepStatsResponse = z.infer<
  typeof getSequenceStepStatsResponse
>
export type SequenceStepStats = GetSequenceStepStatsResponse

export const listSequenceStepContactsRequest = z.object({
  workspaceId: z.string(),
  sequenceId: z.string(),
  stepId: z.string(),
  eventType: sequenceStepEventType,
  total: z.number().optional(),
  page: z.number().default(1),
  perPage: z.number().default(20),
})

export type ListSequenceStepContactsRequest = z.infer<
  typeof listSequenceStepContactsRequest
>

export const sequenceStepContactResource = z.object({
  contactId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.string(),
  errorContent: z.string().nullable(),
  occurredAt: z.string().nullable(),
})

export type SequenceStepContactResource = z.infer<
  typeof sequenceStepContactResource
>

export const sequenceStepContactData = sequenceStepContactResource.extend({
  conversationId: z.string(),
})

export type SequenceStepContactData = z.infer<typeof sequenceStepContactData>

export const listSequenceStepContactsResponse = z.object({
  data: z.array(sequenceStepContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export type ListSequenceStepContactsResponse = z.infer<
  typeof listSequenceStepContactsResponse
>
