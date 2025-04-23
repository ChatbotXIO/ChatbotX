import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getFlowsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  status: parseAsString.withDefault(""),
})

export type GetFlowsSchema = Awaited<
  ReturnType<typeof getFlowsSearchParamsCache.parse>
> & { chatbotId: string }
