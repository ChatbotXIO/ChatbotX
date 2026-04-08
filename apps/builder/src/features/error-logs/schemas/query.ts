import type { ErrorLogModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { contactResource } from "@/features/contacts/schemas/resource"
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

export const listErrorLogsResponse = z.object({
  data: z.array(
    errorLogResource.and(
      z.object({
        contact: contactResource.nullable(),
      }),
    ),
  ),
  pageCount: z.number(),
})
export type ListErrorLogsResponse = z.infer<typeof listErrorLogsResponse>

export const publicListErrorLogsResponse = z.object({
  data: z.array(errorLogResource),
  pageCount: z.number(),
})
export type PublicListErrorLogsResponse = z.infer<
  typeof publicListErrorLogsResponse
>
