import { notFoundException } from "@chatbotx.io/business/errors"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { getWorkspaceMember, listWorkspaceMembers } from "../queries"
import {
  getWorkspaceMemberRequest,
  getWorkspaceMemberResponse,
  listWorkspaceMembersRequest,
  listWorkspaceMembersResponse,
} from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const workspaceMembersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/members",
      summary: "List workspace members",
      tags: ["Members"],
    })
    .input(
      withPublicPaging(listWorkspaceMembersRequest.omit({ workspaceId: true })),
    )
    .output(listWorkspaceMembersResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listWorkspaceMembers({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/members/{memberId}",
      summary: "Get workspace member by id",
      tags: ["Members"],
    })
    .input(getWorkspaceMemberRequest.omit({ workspaceId: true }))
    .output(getWorkspaceMemberResponse)
    .errors(possibleErrorsOnFindingResource)
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
