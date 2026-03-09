import type { FieldModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import type z from "zod"
import { accountFieldResource } from "./resource"

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

export const findAccountFieldRequest = accountFieldResource
  .pick({ id: true, chatbotId: true, name: true })
  .partial()
export type FindAccountFieldRequest = z.infer<typeof findAccountFieldRequest>
