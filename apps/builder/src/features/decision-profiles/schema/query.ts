import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import type { DecisionProfileListItem } from "./resource"

export const listDecisionProfilesSearchParams = {
  name: parseAsString,
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<DecisionProfileListItem>().withDefault([
    { id: "name", desc: false },
  ]),
}

export const listDecisionProfilesSearchParamsCache = createSearchParamsCache(
  listDecisionProfilesSearchParams,
)

export type ListDecisionProfilesRequest = Awaited<
  ReturnType<typeof listDecisionProfilesSearchParamsCache.parse>
> & { workspaceId: string }
