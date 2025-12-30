import type { ReflinkModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listReflinksParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<ReflinkModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListReflinksRequest = Awaited<
  ReturnType<typeof listReflinksParams.parse>
> & { chatbotId: string }
