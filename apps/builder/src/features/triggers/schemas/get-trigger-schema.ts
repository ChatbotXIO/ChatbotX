import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import type { TriggerModel } from "node_modules/@aha.chat/database/src/generated/prisma/models/Trigger"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getTriggersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<TriggerModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsString,
})

export type GetTriggersSchema = Awaited<
  ReturnType<typeof getTriggersSearchParamsCache.parse>
> & {
  chatbotId: string
}
