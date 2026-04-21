import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
import { type BotFieldResource, botFieldResource, publicBotFieldResource } from "./resource"

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

export const findBotFieldRequest = botFieldResource
  .pick({ id: true, workspaceId: true, name: true })
  .partial()
export type FindBotFieldRequest = z.infer<typeof findBotFieldRequest>

export const findBotFieldByKeyRequest = z.object({
  key: z.string(),
  workspaceId: z.string(),
})
export type FindBotFieldByKeyRequest = z.infer<typeof findBotFieldByKeyRequest>
