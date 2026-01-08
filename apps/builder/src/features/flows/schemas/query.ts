import type { FlowModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listFlowsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<FlowModel>(),
  name: parseAsString,
  folderId: parseAsString,
  active: parseAsBoolean,
})

export type ListFlowsParams = Awaited<
  ReturnType<typeof listFlowsSearchParams.parse>
> & {
  chatbotId: string
  folderId?: string | null
}

export type FindFlowParams = {
  id: string
  chatbotId: string
}
