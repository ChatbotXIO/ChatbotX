import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AiTrigger } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAiTriggerSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AiTrigger>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  flowId: parseAsString,
})

export type AiTriggersSchema = Awaited<
  ReturnType<typeof getAiTriggerSearchParamsCache.parse>
> & {
  chatbotId: string
}

export type GetAiTriggersSchema = Awaited<
  ReturnType<typeof getAiTriggerSearchParamsCache.parse>
> & {
  chatbotId: string
}
