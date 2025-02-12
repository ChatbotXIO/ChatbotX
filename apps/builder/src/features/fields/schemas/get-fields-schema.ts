import { getSortingStateParser } from "@/components/data-table/parsers"
import type { Field, FieldType } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getFieldsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  sort: getSortingStateParser<Field>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type GetFieldsSchema = Awaited<
  ReturnType<typeof getFieldsSearchParamsCache.parse>
> & {
  chatbotId: string
  folderId?: string | null
  fieldType: FieldType
}

export type CustomFieldResource = Field
export type CustomFieldCollection = {
  data: CustomFieldResource[]
  pageCount: number
}
