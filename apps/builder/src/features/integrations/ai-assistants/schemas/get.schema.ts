import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AiAssistant } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAiAssistantsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AiAssistant>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type GetAiAssistantsSchema = Awaited<
  ReturnType<typeof getAiAssistantsSearchParamsCache.parse>
> & {
  chatbotId: string
}
