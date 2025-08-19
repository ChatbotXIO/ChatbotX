import type { FlowModel, FlowVersionModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listFlowsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<FlowModel>().withDefault([
    { id: "updatedAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsString,
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

export type FlowVersionResource = FlowVersionModel

export type FlowResource = FlowModel & {
  _count?: {
    contacts?: number
  }
  flowVersions?: FlowVersionResource[]
}

export type FlowCollection = {
  data: FlowResource[]
  pageCount: number
}
