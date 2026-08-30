import { oc } from "@orpc/contract"
import { publicListInboxTeamsResponse } from "./resource"

export const listTeamsContract = oc
  .route({
    method: "GET",
    path: "/v1/teams",
    summary: "List teams",
    tags: ["Teams"],
  })
  .output(publicListInboxTeamsResponse)

export const inboxTeamContract = {
  listTeamsContract,
}

export * from "./resource"
