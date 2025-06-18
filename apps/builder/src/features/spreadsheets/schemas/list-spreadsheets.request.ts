import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const listSpreadsheetsRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export type ListSpreadsheetsRequest = Awaited<
  ReturnType<typeof listSpreadsheetsRequest.parse>
> & { chatbotId: string }
