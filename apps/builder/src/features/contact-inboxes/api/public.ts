import { contactService } from "@chatbotx.io/business"
import { contactInboxRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { listContactInboxesPublicResponse } from "@/features/contact-inboxes/schema/public"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsInboxesPublicRouter = {
  listInboxes: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/inboxes",
      summary: "List the contact's channel identities (contact inboxes)",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(listContactInboxesPublicResponse)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const data = await contactInboxRepository.listWithInboxNameByContactId({
        workspaceId,
        contactId,
      })
      return { data }
    }),
}
