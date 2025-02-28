import type { Contact } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getContactsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
})

export type GetContactsSchema = Awaited<
  ReturnType<typeof getContactsSearchParamsCache.parse>
> & { chatbotId: string }

export type ContactResource = Contact
