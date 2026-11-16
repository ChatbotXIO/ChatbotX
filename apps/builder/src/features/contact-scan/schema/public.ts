import { zodBigintAsString } from "@chatbotx.io/utils"
import { contactScanChannels } from "@chatbotx.io/utils/channel"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { cancelContactScanResponse } from "./action"
import { contactScanRunStatus, getContactScanStatusRequest } from "./query"

export const getContactScanStatusPublicRequest =
  getContactScanStatusRequest.omit({
    workspaceId: true,
  })

export { getContactScanStatusResponse } from "./query"

export const scheduleContactScanPublicRequest = z.object({
  inboxId: zodBigintAsString().describe(
    "Inbox id. Get it from `inboxes.list`.",
  ),
  scanFromAt: z.coerce
    .date()
    .describe(
      "Only scan conversations whose last activity is after this date (a conversation updated exactly at this instant is not included).",
    ),
})

export const cancelContactScanPublicRequest = z.object({
  inboxId: zodBigintAsString().describe(
    "Inbox id. Get it from `inboxes.list`.",
  ),
})

export const cancelContactScanPublicResponse = cancelContactScanResponse.extend(
  {
    cancelled: z
      .boolean()
      .describe(
        "`true` when a running scan was cancelled; `false` when the inbox has no running scan (not an error).",
      ),
  },
)

export const scheduleContactScanPublicResponse = z.object({
  runId: z.string(),
})

/** No `workspaceId` — `public-spec-operations.test.ts` fails any public response carrying one. */
export const contactScanRunPublicResource = z.object({
  id: zodBigintAsString(),
  channel: contactScanChannels,
  status: contactScanRunStatus,
  scanFromAt: z.date().nullable(),
  importedContactCount: z.number(),
  currentScan: z.number(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  createdAt: z.date(),
  requestedByUserId: z.string().nullable(),
  currentError: z.string().nullable(),
})

export const listContactScansPublicRequest = publicListRequest.extend({
  integrationId: zodBigintAsString()
    .optional()
    .describe(
      "Only scans of this channel integration. Get it from the channel list routes, e.g. `messengerChannels.list`.",
    ),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `createdAt`, `status`. Defaults to newest first.",
    ),
})
export const listContactScansPublicResponse = publicListResponse(
  contactScanRunPublicResource,
)
