import { contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { possibleErrorsOnMutatingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { refreshContactProfile } from "../../lib/refresh-contact-profile"
import { refreshContactProfilePublicResponse } from "../../schema/public/refresh-profile"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsRefreshProfilePublicRouter = {
  refreshProfile: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/refresh-profile",
      summary: "Refresh contact profile from channel",
      description:
        'Re-fetches the contact\'s profile (name, avatar, ...) from the channel API for the given contact inbox, when the channel supports on-demand profile lookup. Returns `{status:"skipped",reason:...}` rather than an error when nothing needed refreshing.',
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
          ),
        contactInboxId: zodBigintAsString().describe(
          "Id (numeric string) of the contact's channel inbox connection to refresh from.",
        ),
      }),
    )
    .output(refreshContactProfilePublicResponse)
    .errors(possibleErrorsOnMutatingResource)
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
