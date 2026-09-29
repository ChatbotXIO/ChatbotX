import { z } from "zod"

/** Client-facing shape of one Calls page row — an explicit allow-list (never the raw DB row), matching the `errorLogResource` convention. */
export const whatsappCallHistoryResource = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  direction: z.enum(["userInitiated", "businessInitiated"]),
  status: z.enum(["ringing", "accepted", "rejected", "completed", "failed"]),
  outcome: z.enum(["completed", "failed", "rejected", "canceled"]).nullable(),
  kind: z
    .enum([
      "ongoing",
      "canceled",
      "declined",
      "missed",
      "unanswered",
      "answeredInbound",
      "answeredOutbound",
    ])
    .nullable(),
  durationSeconds: z.number().nullable(),
  recordingPath: z.string().nullable(),
  conversationId: z.string(),
  contact: z.object({
    id: z.string(),
    fullName: z.string().nullable(),
    avatar: z.string().nullable(),
  }),
  inbox: z.object({ id: z.string(), name: z.string() }),
  answeredByUser: z
    .object({ id: z.string(), name: z.string().nullable() })
    .nullable(),
  initiatedByUser: z
    .object({ id: z.string(), name: z.string().nullable() })
    .nullable(),
})
export type WhatsappCallHistoryResource = z.infer<
  typeof whatsappCallHistoryResource
>

export const listWhatsappCallsResponse = z.object({
  data: z.array(whatsappCallHistoryResource),
  nextCursor: z.string().nullable(),
})
export type ListWhatsappCallsResponse = z.infer<
  typeof listWhatsappCallsResponse
>
