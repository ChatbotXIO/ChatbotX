import type { RefLinkModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listRefLinksParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<RefLinkModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListRefLinksRequest = Awaited<
  ReturnType<typeof listRefLinksParams.parse>
> & { chatbotId: string }
