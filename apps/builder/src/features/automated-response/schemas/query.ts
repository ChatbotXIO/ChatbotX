import type { AutomatedResponseModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
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
  sort: getSortingStateParser<AutomatedResponseModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListAutomatedResponsesRequest = Awaited<
  ReturnType<typeof listAutomatedResponsesSearchParams.parse>
> & { chatbotId: string }
