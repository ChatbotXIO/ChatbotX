import { getSortingStateParser } from "@/lib/parsers"
import type { AIAgent } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAIAgentRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AIAgent>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type ListAIAgentsRequest = Awaited<
  ReturnType<typeof listAIAgentRequest.parse>
> & {
  chatbotId: string
}
