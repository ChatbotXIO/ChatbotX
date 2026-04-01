import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import type z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
import { type BotFieldResource, botFieldResource } from "./resource"

export const listBotFieldsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  folderId: parseAsBigInt,
  sort: getSortingStateParser<BotFieldResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListBotFieldsSearchParams = Awaited<
  ReturnType<typeof listBotFieldsSearchParams.parse>
> & {
  chatbotId: bigint
}

export const findBotFieldRequest = botFieldResource
  .pick({ id: true, chatbotId: true, name: true })
  .partial()
export type FindBotFieldRequest = z.infer<typeof findBotFieldRequest>
