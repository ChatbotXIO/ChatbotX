import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { parseAsBigInt } from "@/lib/nuqs"

export const listAutomatedResponsesSearchParams = createSearchParamsCache({
  folderId: parseAsBigInt,
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  sort: getSortingStateParser<AutomatedResponseModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListAutomatedResponsesRequest = Awaited<
  ReturnType<typeof listAutomatedResponsesSearchParams.parse>
> & { workspaceId: string }

export const findAutomatedResponseRequest = z.object({
  workspaceId: zodBigintAsString(),
  id: zodBigintAsString(),
})
export type FindAutomatedResponseRequest = z.infer<
  typeof findAutomatedResponseRequest
>
