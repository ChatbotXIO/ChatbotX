import { withheldErrorLogColumns } from "@chatbotx.io/business/error-log-columns"
import type { ErrorLogModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { contactResource } from "@/features/contacts/schema/resource"
import { basePaginationRequest } from "@/lib/pagination"
import { errorLogResource } from "./resource"

export const listErrorLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<ErrorLogModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listErrorLogsRequest = basePaginationRequest.extend({
  keyword: z.string().optional(),
  workspaceId: z.string(),
})

export type ListErrorLogsRequest = z.infer<typeof listErrorLogsRequest>

// The withheld columns are kept out of the internal route too, not just the
// public one: the query never selects them (see `queries/index.ts`) and none is
// sortable. The list of them lives on `./columns`, so this omission and the
// query's projection cannot drift apart.
export const listErrorLogsResponse = z.object({
  data: z.array(
    errorLogResource.omit(withheldErrorLogColumns(true)).and(
      z.object({
        contact: contactResource
          .and(
            z.object({
              conversation: z.object({ id: z.string() }).nullish(),
            }),
          )
          .nullable(),
      }),
    ),
  ),
  pageCount: z.number(),
})
export type ListErrorLogsResponse = z.infer<typeof listErrorLogsResponse>

// Explicit allow-list, not the internal resource: `errorLogResource` is a
// `createSelectSchema`, so anything picked here is a stable contract and
// anything new on the table stays out until it is added deliberately. See
// products/schema/public.ts for the same pattern.
//
// `sourceId` is the field this list is keeping out today: the route is gated by
// the `analytics` scope, while the same channel identity (PSID / IGSID /
// `wa_id`) is public only under `contacts`
// (`features/contact-inboxes/api/public.ts`), so an analytics-only BI token
// could otherwise page `/v1/error-logs` to harvest them.
export const publicListErrorLogsResponse = z.object({
  data: z.array(
    errorLogResource.pick({
      id: true,
      workspaceId: true,
      contactId: true,
      action: true,
      detail: true,
      httpCode: true,
      createdAt: true,
      updatedAt: true,
    }),
  ),
  pageCount: z.number(),
})
export type PublicListErrorLogsResponse = z.infer<
  typeof publicListErrorLogsResponse
>
