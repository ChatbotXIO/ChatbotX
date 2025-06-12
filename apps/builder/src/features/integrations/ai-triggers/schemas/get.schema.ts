import { getSortingStateParser } from "@/lib/parsers"
import type { AITrigger } from "@ahachat.ai/database/types"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAITriggersRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AITrigger>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type ListAITriggersRequest = Partial<
  Awaited<ReturnType<typeof listAITriggersRequest.parse>>
> & {
  chatbotId?: string
}

export type AITriggerResource = AITrigger

export type AITriggerCollection = {
  data: AITriggerResource[]
  pageCount: number
}
