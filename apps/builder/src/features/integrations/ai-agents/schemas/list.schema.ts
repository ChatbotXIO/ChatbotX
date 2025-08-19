import type { AIAgentModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listAIAgentRequest = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AIAgentModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type ListAIAgentsRequest = Awaited<
  ReturnType<typeof listAIAgentRequest.parse>
> & {
  chatbotId: string
}
