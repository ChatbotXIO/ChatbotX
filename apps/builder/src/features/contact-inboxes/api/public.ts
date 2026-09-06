import { contactService } from "@chatbotx.io/business"
import { contactInboxRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { listContactInboxesPublicResponse } from "@/features/contact-inboxes/schema/public"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsInboxesPublicRouter = {
  // Deliberately uncached: channel webhooks create/update ContactInbox
  // identities and the sequence scheduler advances enrollments, neither of
  // which routes through the `contacts:*` cache tags this PR controls. A
  // stale read here is worse for an AI/MCP caller (acting on a channel
  // identity list that's already changed) than paying for the DB hit.
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
