import {
  invitationService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { getWorkspaceMember, listWorkspaceMembers } from "../queries"
import {
  inviteWorkspaceMemberPublicRequest,
  removeWorkspaceMemberPublicRequest,
  updateWorkspaceMemberPublicRequest,
  workspaceInvitationPublicResource,
  workspaceMemberPublicResource,
} from "../schema/public"
import {
  getWorkspaceMemberRequest,
  getWorkspaceMemberResponse,
  listWorkspaceMembersRequest,
  listWorkspaceMembersResponse,
} from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

const workspaceTokenWorkspaceAuthAPI =
  workspaceTokenAuthAPIForScope("workspace")

const tags = ["Members"]

export const workspaceMembersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/members",
      summary: "List workspace members",
      tags,
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
      tags,
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

  invite: workspaceTokenWorkspaceAuthAPI
    .route({
      method: "POST",
      path: "/v1/members/invitations",
      summary: "Invite a workspace member",
      successStatus: 201,
      tags,
    })
    .input(inviteWorkspaceMemberPublicRequest)
    .output(workspaceInvitationPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      return await invitationService.create({
        workspaceId: context.workspace.id,
        permissions: input.permissions,
        // Invitation.invitedBy is not nullable; attribute token-created invites
        // to the workspace owner rather than fabricate a human actor.
        invitedBy: context.workspace.ownerId,
      })
    }),

  update: workspaceTokenWorkspaceAuthAPI
    .route({
      method: "PUT",
      path: "/v1/members/{memberId}",
      summary: "Update a workspace member",
      tags,
    })
    .input(updateWorkspaceMemberPublicRequest)
    .output(workspaceMemberPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { memberId, ...data } = input
      await workspaceMemberService.findByIdOrFail({
        id: memberId,
        workspaceId: context.workspace.id,
      })
      await workspaceMemberService.update({
        id: memberId,
        workspaceId: context.workspace.id,
        data,
      })
      return await workspaceMemberService.findByIdOrFail({
        id: memberId,
        workspaceId: context.workspace.id,
      })
    }),

  remove: workspaceTokenWorkspaceAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/members/{memberId}",
      summary: "Remove a workspace member",
      successStatus: 204,
      tags,
    })
    .input(removeWorkspaceMemberPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const member = await workspaceMemberService.findByIdOrFail({
        id: input.memberId,
        workspaceId: context.workspace.id,
      })
      if (member.role === "owner") {
        throw new ChatbotXException(
          "You cannot delete the owner of the workspace",
        )
      }
      await workspaceMemberService.delete({
        id: member.id,
        workspaceId: context.workspace.id,
      })
    }),
}
