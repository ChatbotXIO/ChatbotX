import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
import { type BotFieldResource, publicBotFieldResource } from "./resource"

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
  workspaceId: string
}

export const publicListBotFieldsResponse = z.object({
  data: z.array(publicBotFieldResource),
})
