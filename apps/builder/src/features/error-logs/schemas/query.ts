import { createSelectSchema, errorLogModel } from "@chatbotx.io/database/schema"
import type { ErrorLogModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"

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

export const publicErrorLogResource = createSelectSchema(errorLogModel)
export type PublicErrorLogResource = z.infer<typeof publicErrorLogResource>

export const publicListErrorLogsResponse = z.object({
  data: z.array(publicErrorLogResource),
  pageCount: z.number(),
})
export type PublicListErrorLogsResponse = z.infer<
  typeof publicListErrorLogsResponse
>
