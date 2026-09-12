import { zodBigintAsString } from "@chatbotx.io/utils"
import { contactScanChannels } from "@chatbotx.io/utils/channel"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { contactScanRunStatus, getContactScanStatusRequest } from "./query"

export const getContactScanStatusPublicRequest =
  getContactScanStatusRequest.omit({
    workspaceId: true,
  })

export { getContactScanStatusResponse } from "./query"

export const scheduleContactScanPublicRequest = z.object({
  inboxId: zodBigintAsString(),
  scanFromAt: z.coerce.date(),
})

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

export const listContactScansPublicRequest = publicListRequest
export const listContactScansPublicResponse = publicListResponse(
  contactScanRunPublicResource,
)
