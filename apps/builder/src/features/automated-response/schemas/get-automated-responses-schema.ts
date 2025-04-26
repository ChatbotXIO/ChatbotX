import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAutomatedResponsesSearchParams = createSearchParamsCache({
  folderId: parseAsString,
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
})

export type ListAutomatedResponsesRequest = Awaited<
  ReturnType<typeof listAutomatedResponsesSearchParams.parse>
> & { chatbotId: string }
