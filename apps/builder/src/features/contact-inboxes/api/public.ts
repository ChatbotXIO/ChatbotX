import { contactInboxService, contactService } from "@chatbotx.io/business"
import { z } from "zod"
import { listContactInboxesPublicResponse } from "@/features/contact-inboxes/schema/public"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsInboxesPublicRouter = {
  listInboxes: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/inboxes",
      summary: "List contact channel identities",
      description:
        "Returns each channel-specific connection (contact inbox) this contact has, e.g. their WhatsApp phone number or Messenger PSID per inbox. Use `contacts.get` to resolve the contact first.",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .output(listContactInboxesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const data = await contactInboxService.listByContactIdUncached({
        workspaceId,
        contactId,
      })
      return { data }
    }),
}
