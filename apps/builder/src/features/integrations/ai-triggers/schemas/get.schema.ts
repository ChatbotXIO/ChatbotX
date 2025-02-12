import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AITrigger } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAITriggerSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AITrigger>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  flowId: parseAsString,
})

export type AITriggersSchema = Awaited<
  ReturnType<typeof getAITriggerSearchParamsCache.parse>
> & {
  chatbotId: string
}

export type GetAITriggersSchema = Partial<
  Awaited<ReturnType<typeof getAITriggerSearchParamsCache.parse>>
> & {
  chatbotId?: string
}
