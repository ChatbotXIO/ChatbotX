import {
  type ContactInfoType,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import { z } from "zod"

/**
 * Contact-info capture events: a contact left a phone number / an email while
 * the last bot content they got was the broadcast. Counted from
 * `ContactInfoCapture`, not from `ContactOnBroadcast`.
 */
export const contactInfoCaptureEventType = z.enum([
  "contactInfo:phoneCaptured",
  "contactInfo:emailCaptured",
])

export type ContactInfoCaptureEventType = z.infer<
  typeof contactInfoCaptureEventType
>

/** The captured info type each capture event reads. */
export const CONTACT_INFO_CAPTURE_EVENT_INFO_TYPE: Record<
  ContactInfoCaptureEventType,
  ContactInfoType
> = {
  "contactInfo:phoneCaptured": "phone",
  "contactInfo:emailCaptured": "email",
}

export const isContactInfoCaptureEvent = (
  eventType: BroadcastEventType,
): eventType is ContactInfoCaptureEventType =>
  contactInfoCaptureEventType.safeParse(eventType).success

export const broadcastEventType = z.enum([
  ...messageEventTypeSchema.options,
  ...flowEventTypeSchema.options,
  ...contactInfoCaptureEventType.options,
])

export type BroadcastEventType = z.infer<typeof broadcastEventType>

export const getBroadcastStatsRequest = z.object({
  workspaceId: z.string(),
  broadcastId: z
    .string()
    .describe("Broadcast id. Get it from `broadcasts.list`."),
})

export type GetBroadcastStatsRequest = z.infer<typeof getBroadcastStatsRequest>

export const getBroadcastStatsResponse = z.object({
  "message:sent": z.number(),
  "message:delivered": z.number(),
  "message:seen": z.number(),
  "flow:clicked": z.number(),
  "message:failed": z.number(),
  "contactInfo:phoneCaptured": z
    .number()
    .describe("Contacts who left a phone number after this broadcast."),
  "contactInfo:emailCaptured": z
    .number()
    .describe("Contacts who left an email after this broadcast."),
})

export type GetBroadcastStatsResponse = z.infer<
  typeof getBroadcastStatsResponse
>
export type BroadcastStats = GetBroadcastStatsResponse

export const getBatchBroadcastStatsRequest = z.object({
  workspaceId: z.string(),
  broadcastIds: z.array(z.string()),
})

export type GetBatchBroadcastStatsRequest = z.infer<
  typeof getBatchBroadcastStatsRequest
>

export const getBatchBroadcastStatsResponse = z.record(
  z.string(),
  getBroadcastStatsResponse,
)

export type GetBatchBroadcastStatsResponse = z.infer<
  typeof getBatchBroadcastStatsResponse
>

export const listBroadcastContactsRequest = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
  eventType: broadcastEventType.optional(),
  page: z.number().default(1),
  perPage: z.number().default(20),
})

export type ListBroadcastContactsRequest = z.infer<
  typeof listBroadcastContactsRequest
>

export const broadcastContactResource = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.enum(channelTypes.enum),
  errorContent: z.string().nullable(),
  occurredAt: z.string(),
})

export type BroadcastContactResource = z.infer<typeof broadcastContactResource>

export const broadcastContactData = broadcastContactResource.extend({
  conversationId: z.string(),
})

export type BroadcastContactData = z.infer<typeof broadcastContactData>

export const listBroadcastContactsResponse = z.object({
  data: z.array(broadcastContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export type ListBroadcastContactsResponse = z.infer<
  typeof listBroadcastContactsResponse
>

export const broadcastUpdateItem = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
  contactId: z.string(),
  contactInboxId: z.string(),
  occurredAt: z.date(),
})

export type BroadcastUpdateItem = z.infer<typeof broadcastUpdateItem>

// Bulk update schemas - use contactInboxId as key
export const broadcastBulkUpdateItemSchema = z.object({
  broadcastId: z.string(),
  contactInboxId: z.string(),
  occurredAt: z.date(),
})
export type BroadcastBulkUpdateItem = z.infer<
  typeof broadcastBulkUpdateItemSchema
>

export const broadcastFailedBulkUpdateItemSchema =
  broadcastBulkUpdateItemSchema.extend({
    errorContent: z.string(),
  })
export type BroadcastFailedBulkUpdateItem = z.infer<
  typeof broadcastFailedBulkUpdateItemSchema
>
