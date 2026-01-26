import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import type { ContactModel } from "node_modules/@aha.chat/database/src/generated/prisma/models/Contact"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listContactsRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<ContactModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListContactsRequest = Awaited<
  ReturnType<typeof listContactsRequest.parse>
> & { chatbotId: string }
