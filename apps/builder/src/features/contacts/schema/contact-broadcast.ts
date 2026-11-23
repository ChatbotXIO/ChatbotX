import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const CONTACT_BROADCAST_SEARCH_MAX_LENGTH = 100

/** How far a broadcast got for one recipient; the first match wins, from the most specific outcome down. */
export const contactBroadcastRecipientStatuses = z.enum([
  "failed",
  "clicked",
  "seen",
  "delivered",
  "sent",
])
export type ContactBroadcastRecipientStatus = z.infer<
  typeof contactBroadcastRecipientStatuses
>

export const contactBroadcastResource = z.object({
  broadcastId: z
    .string()
    .describe("Id of the broadcast. Pass it to `broadcasts.get`."),
  name: z.string().describe("Name of the broadcast."),
  broadcastStatus: broadcastStatuses.describe(
    "Status of the broadcast itself, not of this contact's delivery.",
  ),
  channel: z.string().describe("Channel the broadcast was sent on."),
  scheduledAt: z.date().describe("When the broadcast was scheduled to send."),
  recipientStatus: contactBroadcastRecipientStatuses.describe(
    "The furthest outcome for this contact: `failed`, `clicked`, `seen`, `delivered` or `sent` (handed to the channel, no delivery receipt yet).",
  ),
  deliveredAt: z.date().nullable(),
  seenAt: z.date().nullable(),
  clickedAt: z.date().nullable(),
  failedAt: z.date().nullable(),
})
export type ContactBroadcastResource = z.infer<typeof contactBroadcastResource>

export const listContactBroadcastsRequest = z.object({
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of broadcasts per page."),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination cursor from a previous response. Omit for the first page.",
    ),
  search: z
    .string()
    .trim()
    .min(1)
    .max(CONTACT_BROADCAST_SEARCH_MAX_LENGTH)
    // Postgres text cannot hold a NUL byte: it would fail in the query as a 500.
    .refine((value) => !value.includes("\u0000"), {
      message: "The search text must not contain a NUL character.",
    })
    .optional()
    .describe(
      "Only broadcasts whose name contains this text, or whose id equals it.",
    ),
})

export const listContactBroadcastsResponse = z.object({
  data: z.array(contactBroadcastResource),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next page; null on the last page."),
})
export type ListContactBroadcastsResponse = z.infer<
  typeof listContactBroadcastsResponse
>
