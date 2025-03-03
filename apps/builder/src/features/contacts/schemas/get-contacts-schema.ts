import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import type { Contact } from "@ahachat.ai/database"

export const listContactsNuqs = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString.withDefault(""),
})

export const listContactsRequest = z.object({
  chatbotId: z.string().cuid2(),
  page: z.number().int().min(1).default(1).optional(),
  perPage: z.number().int().min(1).default(10).optional(),
  keyword: z.string().optional(),
})

export type ListContactsRequest = z.infer<typeof listContactsRequest>

export type ContactResource = Contact
