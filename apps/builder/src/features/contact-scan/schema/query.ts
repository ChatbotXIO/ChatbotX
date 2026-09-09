import {
  coexistScanRunStatuses,
  contactScanViewStatuses,
} from "@chatbotx.io/database/partials"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { ContactScanChannel } from "@chatbotx.io/utils/channel"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import { z } from "zod"
import { basePaginationRequest } from "@/lib/pagination"

export const getContactScanStatusRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString(),
})
export type GetContactScanStatusRequest = z.infer<
  typeof getContactScanStatusRequest
>

/**
 * Statuses a *stored* scan run can carry. Narrower than the DB column's full
 * `coexistRunStatus` enum (which also carries `waiting`, WhatsApp-only —
 * `schema/coexist-sync-run.ts`) because a `type='contact_scan'` row can never
 * be set to it (`ContactScanService.schedule`/the worker engine never write
 * it). `queries/get-contact-scan-status.query.ts` narrows the service's
 * wider `CoexistRunStatus` value down to this wire type at the boundary.
 */
export const contactScanRunStatus = z.enum(coexistScanRunStatuses)
export type ContactScanRunStatus = z.infer<typeof contactScanRunStatus>

export const contactScanRunResource = z.object({
  id: zodBigintAsString(),
  status: contactScanRunStatus,
  scanFromAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
  importedContactCount: z.number(),
  currentScan: z.number(),
  currentError: z.string().nullable(),
})
export type ContactScanRunResource = z.infer<typeof contactScanRunResource>

export const contactScanAvailabilityResource = z.discriminatedUnion("canScan", [
  z.object({ canScan: z.literal(true) }),
  z.object({
    canScan: z.literal(false),
    blockedReason: z.enum(["cooldown", "running"]),
    nextScanAt: z.coerce.date(),
  }),
])
export type ContactScanAvailabilityResource = z.infer<
  typeof contactScanAvailabilityResource
>

/**
 * `status` is the exact field `pollUntilSettled` reads
 * (`lib/query/poll-until-settled.ts`) — it must stay a top-level `string`
 * property on this response.
 */
export const getContactScanStatusResponse = z.object({
  status: z.enum(contactScanViewStatuses),
  latest: contactScanRunResource.nullable(),
  availability: contactScanAvailabilityResource,
})
export type GetContactScanStatusResponse = z.infer<
  typeof getContactScanStatusResponse
>

// --- Scan history list (mirrors `features/import/schema/query.ts`) --------

export const listContactScanHistoryRequest = basePaginationRequest.extend({
  workspaceId: zodBigintAsString(),
})
export type ListContactScanHistoryRequest = z.infer<
  typeof listContactScanHistoryRequest
>

export type ListContactScanHistoryItem = {
  id: string
  workspaceId: string
  channel: ContactScanChannel
  status: ContactScanRunStatus
  scanFromAt: Date | null
  importedContactCount: number
  currentScan: number
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  requestedByUserId: string | null
  currentError: string | null
}

export const listContactScanHistorySearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<ListContactScanHistoryItem>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListContactScanHistoryResponse = {
  data: ListContactScanHistoryItem[]
  pageCount: number
}
