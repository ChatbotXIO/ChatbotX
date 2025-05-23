import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getWhatsappFlowsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  status: parseAsString.withDefault(""),
})

export type GetWhatsappFlowsSchema = Awaited<
  ReturnType<typeof getWhatsappFlowsSearchParamsCache.parse>
> & { chatbotId: string }
