import { broadcastEventType } from "@chatbotx.io/analytics/schemas"
import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"

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
    "Delivery event to filter recipients by (e.g. sent, delivered, read, failed).",
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
})

export const publicListBroadcastContactsResponse = z.object({
  data: z.array(publicBroadcastContactResource),
  pageCount: z.number().int(),
})
