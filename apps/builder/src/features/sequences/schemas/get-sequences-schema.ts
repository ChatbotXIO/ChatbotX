import type { SequenceModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getSequencesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  active: parseAsBoolean,
  folderId: parseAsString,
  sort: getSortingStateParser<SequenceModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type GetSequencesSchema = Awaited<
  ReturnType<typeof getSequencesSearchParamsCache.parse>
> & { chatbotId: string; folderId?: string | null }

export type SequenceResource = SequenceModel & {
  stepsCount: number
  subscribersCount: number
}
