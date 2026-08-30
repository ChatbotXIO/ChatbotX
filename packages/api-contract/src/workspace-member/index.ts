import { oc } from "@orpc/contract"
import {
  getWorkspaceMemberInput,
  listWorkspaceMembersInput,
  publicGetWorkspaceMemberResponse,
  publicListWorkspaceMembersResponse,
} from "./resource"

export const listWorkspaceMembersContract = oc
  .route({
    method: "GET",
    path: "/v1/members",
    summary: "List workspace members",
    tags: ["Members"],
  })
  .input(listWorkspaceMembersInput)
  .output(publicListWorkspaceMembersResponse)

export const getWorkspaceMemberContract = oc
  .route({
    method: "GET",
    path: "/v1/members/{memberId}",
    summary: "Get workspace member by id",
    tags: ["Members"],
  })
  .input(getWorkspaceMemberInput)
  .output(publicGetWorkspaceMemberResponse)

export const workspaceMemberContract = {
  listWorkspaceMembersContract,
  getWorkspaceMemberContract,
}

export * from "./resource"
