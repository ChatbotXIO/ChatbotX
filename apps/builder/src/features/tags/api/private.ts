import { tagService } from "@chatbotx.io/business"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listTags } from "../queries"
import {
  listAppliedTagIdsRequest,
  listAppliedTagIdsResponse,
  listTagOptionsRequest,
  listTagOptionsResponse,
  listTagsRequest,
  listTagsResponse,
} from "../schema/query"

const privateListWorkspaceTagsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(listTagsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listTagsResponse)
  .handler(async ({ input }) => await listTags(input))

const privateListWorkspaceTagOptionsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/tag-options",
    summary: "List tags as picker options (id, name, color; no contact counts)",
    tags: ["Tags"],
  })
  .input(listTagOptionsRequest)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listTagOptionsResponse)
  .handler(async ({ input, context }) => {
    if (input.contactId) {
      // Same gate as the by-id tag actions and `getContact`: a contact outside
      // the member's scope or workspace is not found.
      await requireContactAccessForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      })
    }
    return await tagService.listOptions(input)
  })

// Realtime/UI plumbing (AGENTS.md invariant 23 exemption, like the tag preview
// refresh endpoint): it lets the composer grid re-check the tags it already
// shows after a `contactTagsChanged` echo without refetching every page. The
// public equivalent is `contacts.listTags`.
const privateListAppliedTagIdsAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/contacts/{contactId}/applied-tag-ids",
    summary: "Which of the given tags a contact has (grid refresh)",
    tags: ["Tags"],
  })
  .input(listAppliedTagIdsRequest)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listAppliedTagIdsResponse)
  .handler(async ({ input, context }) => {
    await requireContactAccessForMember({
      permissions: context.workspaceMember.permissions,
      userId: context.user.id,
      workspaceId: input.workspaceId,
      contactId: input.contactId,
    })
    return { appliedTagIds: await tagService.listAppliedTagIds(input) }
  })

export const privateTagsAPI = {
  privateListAppliedTagIdsAPI,
  privateListWorkspaceTagOptionsAPI,
  privateListWorkspaceTagsAPI,
}
