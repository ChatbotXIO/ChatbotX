import { contactNoteService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { requireContactPermissionScopeForMember } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listContactNotesPublicResponse } from "../schema/public"

const listContactNotesRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
})

export const contactNotesAuthenticatedAPI = {
  listContactNotesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/notes",
      summary: "List contact notes",
      tags: ["Contact Notes"],
    })
    .input(listContactNotesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactNotesPublicResponse)
    .handler(async ({ input, context }) => {
      const scope = requireContactPermissionScopeForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
      })

      return {
        data: await contactNoteService.listByContactId({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          accessScope: {
            restrictToAssignedUserId: scope.restrictToAssignedUserId,
          },
        }),
      }
    }),
}
