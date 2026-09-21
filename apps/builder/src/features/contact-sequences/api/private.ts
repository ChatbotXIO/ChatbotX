import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
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
    .handler(async ({ input }) => ({
      data: await contactSequenceService.listByContactId({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      }),
    })),
}
