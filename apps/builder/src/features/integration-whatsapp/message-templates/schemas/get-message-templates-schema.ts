import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const getMessageTemplatesSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export type GetMessageTemplatesSchema = Awaited<
  ReturnType<typeof getMessageTemplatesSearchParams.parse>
> & { chatbotId: string }
