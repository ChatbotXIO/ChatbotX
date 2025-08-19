import type { LogModel, LogType } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  action: parseAsString.withDefault(""),
  sort: getSortingStateParser<LogModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type GetLogsSchema = Awaited<
  ReturnType<typeof getLogsSearchParamsCache.parse>
> & {
  chatbotId: string
  logType: LogType
}
