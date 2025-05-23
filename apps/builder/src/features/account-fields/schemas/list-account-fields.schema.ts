import { getSortingStateParser } from "@/lib/parsers"
import type { Field } from "@ahachat.ai/database"
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
  sort: getSortingStateParser<Field>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListAccountFieldsSearchParams = Awaited<
  ReturnType<typeof listAccountFieldsSearchParams.parse>
> & {
  chatbotId: string
}
