import { getSortingStateParser } from "@/components/data-table/parsers"
import type { Log, LogType } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  action: parseAsString.withDefault(""),
  sort: getSortingStateParser<Log>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type GetLogsSchema = Awaited<
  ReturnType<typeof getLogsSearchParamsCache.parse>
> & {
  chatbotId: string
  logType: LogType
}
