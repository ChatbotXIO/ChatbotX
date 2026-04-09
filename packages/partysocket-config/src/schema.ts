import z from "zod"

export const RealtimeEventType = {
  messageCreated: "messageCreated",
  typing: "typing",
  contactBlocked: "contactBlocked",
  contactUnblocked: "contactUnblocked",
  conversationAssigned: "conversationAssigned",
} as const

export const realtimeEventTypes = z.enum([
  "messageCreated",
  "typing",
  "contactBlocked",
  "contactUnblocked",
  "conversationAssigned",
  "conversationUnassigned",
])

export const realtimeEvents = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal(realtimeEventTypes.enum.messageCreated),
    data: z.unknown(),
  }),
  z.object({
    eventType: z.literal(realtimeEventTypes.enum.typing),
    data: z.object({
      conversationId: z.string(),
      typing: z.boolean(),
      seconds: z.number(),
    }),
  }),
  z.object({
    eventType: z.literal(realtimeEventTypes.enum.contactBlocked),
    data: z.object({
      contactId: z.string(),
    }),
  }),
  z.object({
    eventType: z.literal(realtimeEventTypes.enum.contactUnblocked),
    data: z.object({
      contactId: z.string(),
    }),
  }),
  z.object({
    eventType: z.literal(realtimeEventTypes.enum.conversationAssigned),
    data: z.object({
      conversationIds: z.array(z.string()),
      assignedUserId: z.string().nullable(),
      assignedInboxTeamId: z.string().nullable(),
    }),
  }),
])
export type RealtimeEvent = z.infer<typeof realtimeEvents>
