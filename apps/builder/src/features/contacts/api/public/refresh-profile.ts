import { contactService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { refreshContactProfile } from "../../lib/refresh-contact-profile"
import { refreshContactProfilePublicResponse } from "../../schema/public/refresh-profile"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsRefreshProfilePublicRouter = {
  refreshProfile: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/refresh-profile",
      summary: "Refresh a contact's profile from the channel",
      description:
        'Re-fetches the contact\'s profile (name, avatar, ...) from the channel API for the given contact inbox, when the channel supports on-demand profile lookup. Returns `{status:"skipped",reason:...}` rather than an error when nothing needed refreshing.',
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        contactInboxId: z.string(),
      }),
    )
    .output(refreshContactProfilePublicResponse)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      return await refreshContactProfile({
        workspaceId,
        contactId,
        contactInboxId: input.contactInboxId,
      })
    }),
}
