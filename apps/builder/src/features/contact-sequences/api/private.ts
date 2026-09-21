import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listContactSequencesPublicResponse } from "../schema/public"

const listContactSequencesRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
})

export const contactSequencesAuthenticatedAPI = {
  listContactSequencesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/sequences",
      summary: "List contact sequences",
      tags: ["Contact Sequences"],
    })
    .input(listContactSequencesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactSequencesPublicResponse)
    .handler(async ({ input, context }) => {
      await requireContactAccessForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      })

      return {
        data: await contactSequenceService.listByContactId({
          workspaceId: input.workspaceId,
          contactId: input.contactId,

        }),
      }
    }),
}
