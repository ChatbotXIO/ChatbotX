import { getSortingStateParser } from "@/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import type { CustomFieldResource } from "./types"

export const listCustomFieldsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  folderId: parseAsString,
  sort: getSortingStateParser<CustomFieldResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListCustomFieldsSearchParams = Awaited<
  ReturnType<typeof listCustomFieldsSearchParams.parse>
> & {
  chatbotId: string
}
