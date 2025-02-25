import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAutomatedResponsesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
})

export type GetAutomatedResponseSchema = Awaited<
  ReturnType<typeof getAutomatedResponsesSearchParamsCache.parse>
> & { chatbotId: string }

export type ShowAutomatedResponseSchema = {
  id: string
}
