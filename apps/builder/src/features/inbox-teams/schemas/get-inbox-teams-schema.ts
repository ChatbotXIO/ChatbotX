

import { getSortingStateParser } from "@/components/data-table/parsers"
import { TeamMember } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getInboxTeamMembersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  sort: getSortingStateParser<TeamMember>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  teamId: parseAsString.withDefault(""),
})

export type GetInboxTeamMembersSchema = Awaited<ReturnType<typeof getInboxTeamMembersSearchParamsCache.parse>> & {
  chatbotId: string,
  teamId: string
}


export type GetInboxTeamsSchema = {
  chatbotId: string,
}
