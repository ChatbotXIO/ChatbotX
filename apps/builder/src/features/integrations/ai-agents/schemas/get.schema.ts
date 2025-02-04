import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AiAgent } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAiAgentSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AiAgent>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  promptId: parseAsString,
})

export type AiAgentsSchema = Awaited<
  ReturnType<typeof getAiAgentSearchParamsCache.parse>
> & {
  chatbotId: string
}

export type GetAiAgentsSchema = Awaited<
  ReturnType<typeof getAiAgentSearchParamsCache.parse>
> & {
  chatbotId: string
}
