import { Operator } from "@aha.chat/database/enums"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import type { ContactModel } from "node_modules/@aha.chat/database/src/generated/prisma/models/Contact"
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"

export const listContactsRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<ContactModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  includes: parseAsArrayOf(parseAsString),
})

export type ListContactsRequest = Awaited<
  ReturnType<typeof listContactsRequest.parse>
> & { chatbotId: string }

export const contactFilterRequest = z.object({
  contactFilter: z.object({
    operator: z.enum(["and", "or"]),
    conditions: z.array(
      z.object({
        field: z.string().trim(),
        operator: z.enum(Operator),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    ),
  }),
})
export type ContactFilterRequest = z.infer<typeof contactFilterRequest>
