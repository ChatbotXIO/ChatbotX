import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AIAssistant } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAIAssistantsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AIAssistant>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type GetAIAssistantsSchema = Awaited<
  ReturnType<typeof getAIAssistantsSearchParamsCache.parse>
> & {
  chatbotId: string
}
