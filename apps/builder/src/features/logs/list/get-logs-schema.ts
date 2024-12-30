import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
})

export type GetLogsSchema = Awaited<ReturnType<typeof getLogsSearchParamsCache.parse>> & { chatbotId: string }
