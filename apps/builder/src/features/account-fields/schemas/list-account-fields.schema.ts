import { getSortingStateParser } from "@/lib/parsers"
import type { FieldModel } from "@aha.chat/database/types"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAccountFieldsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  folderId: parseAsString,
  sort: getSortingStateParser<FieldModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListAccountFieldsSearchParams = Awaited<
  ReturnType<typeof listAccountFieldsSearchParams.parse>
> & {
  chatbotId: string
}
