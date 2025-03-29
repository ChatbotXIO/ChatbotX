import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const getMessageTemplatesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export type GetMessageTemplatesSchema = Awaited<
  ReturnType<typeof getMessageTemplatesSearchParamsCache.parse>
> & { chatbotId: string }
