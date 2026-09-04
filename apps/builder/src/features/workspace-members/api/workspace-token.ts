import { notFoundException } from "@chatbotx.io/business/errors"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { getWorkspaceMember, listWorkspaceMembers } from "../queries"
import {
  getWorkspaceMemberRequest,
  getWorkspaceMemberResponse,
  listWorkspaceMembersRequest,
  listWorkspaceMembersResponse,
} from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const workspaceMembersAPIs = {
  listMembersWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/members",
      summary: "List workspace members",
      tags: ["Members"],
    })
    .input(listWorkspaceMembersRequest.omit({ workspaceId: true }))
    .output(listWorkspaceMembersResponse)
    .handler(
      async ({ context, input }) =>
        await listWorkspaceMembers({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
  getMemberWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/members/{memberId}",
      summary: "Get workspace member by id",
      tags: ["Members"],
    })
    .input(getWorkspaceMemberRequest.omit({ workspaceId: true }))
    .output(getWorkspaceMemberResponse)
    .handler(async ({ context, input }) => {
      const member = await getWorkspaceMember({
        ...input,
        workspaceId: context.workspace.id,
      })
      if (!member) {
        throw notFoundException("Member not found")
      }
      return member
    }),
}

export default workspaceMembersAPIs
