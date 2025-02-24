import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AIAgent } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAIAgentSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AIAgent>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  promptId: parseAsString,
})

export type ListAIAgentsSchema = Awaited<
  ReturnType<typeof getAIAgentSearchParamsCache.parse>
> & {
  chatbotId: string
}
