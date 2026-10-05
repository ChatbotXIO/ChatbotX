import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
import { basePaginationRequest } from "@/lib/pagination"
import { publicListRequest } from "@/lib/public-api/list"
import {
  type BotFieldResource,
  botFieldResource,
  publicBotFieldResource,
} from "./resource"

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
  pageCount: z.number().int(),
})

export const listBotFieldsPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .nullish()
    .describe("Case-insensitive substring match on the bot field name."),
  folderId: zodBigintAsString()
    .nullish()
    .describe(
      'Folder id to filter by. Pass "0" for bot fields in no folder. Omit for all folders.',
    ),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `name`, `createdAt`. Defaults to newest first.",
    ),
})

export const listBotFieldsRequest = basePaginationRequest.extend({
  name: z.string().nullish(),
  folderId: zodBigintAsString().nullish(),
})
export type ListBotFieldsRequest = z.infer<typeof listBotFieldsRequest>

export const listBotFieldsResponse = z.object({
  data: z.array(botFieldResource),
  pageCount: z.number(),
})
export type ListBotFieldsResponse = z.infer<typeof listBotFieldsResponse>
