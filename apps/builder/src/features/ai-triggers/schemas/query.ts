import type { AITriggerModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAITriggersRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AITriggerModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type ListAITriggersRequest = Awaited<
  ReturnType<typeof listAITriggersRequest.parse>
> & {
  workspaceId: string
}

export type AITriggerResource = AITriggerModel

export type AITriggerCollection = {
  data: AITriggerResource[]
  pageCount: number
}
