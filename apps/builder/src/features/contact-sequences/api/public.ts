import { contactService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { z } from "zod"
import {
  contactSequenceIdsPublicRequest,
  listContactSequencesPublicResponse,
  setContactSequencesPublicRequest,
} from "@/features/contact-sequences/schema/public"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsSequencesPublicRouter = {
  listSequences: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "List contact sequence subscriptions",
      description:
        "Use this to inspect a contact's current sequence subscriptions after resolving the contact with `contacts.get`. Call `contacts.subscribeSequences` to subscribe it, or `sequences.get` to inspect a sequence.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
          ),
      }),
    )
    .output(listContactSequencesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const data = await contactSequenceService.listByContactId({
        workspaceId,
        contactId,
      })
      return { data }
    }),

  subscribeSequences: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "Subscribe contact to sequences",
      description:
        "Adds the contact identified by `identifier` to each given sequence; sequences the contact is already subscribed to are left as-is. Use `sequences.list`/`sequences.create` first to resolve names to ids.",
      successStatus: 204,
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      contactSequenceIdsPublicRequest.and(
        z.object({
          identifier: z
            .string()
            .min(1)
            .describe(
              "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
            ),
        }),
      ),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await contactSequenceService.subscribeContacts({
        workspaceId,
        contactIds: [contactId],
        sequenceIds: input.sequenceIds,
      })
    }),

  unsubscribeSequences: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "Unsubscribe contact from sequences",
      description:
        "Removes the contact identified by `identifier` from each given sequence; sequences it isn't subscribed to are ignored. Use `contacts.listSequences` to see current subscriptions first.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      contactSequenceIdsPublicRequest.and(
        z.object({
          identifier: z
            .string()
            .min(1)
            .describe(
              "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
            ),
        }),
      ),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await contactSequenceService.removeContactSequencesForContacts({
        workspaceId,
        contactIds: [contactId],
        sequenceIds: input.sequenceIds,
        reason: "subscription_removed",
      })
    }),

  setSequences: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "Replace contact sequence subscriptions",
      description:
        "Sets the contact's active sequence subscriptions to exactly this list — sequences not in `sequenceIds` are unsubscribed, missing ones are subscribed. Pass an empty array to unsubscribe from everything.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      setContactSequencesPublicRequest.and(
        z.object({
          identifier: z
            .string()
            .min(1)
            .describe(
              "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
            ),
        }),
      ),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await contactSequenceService.updateContactSequences({
        workspaceId,
        contactId,
        sequenceIds: input.sequenceIds,
      })
    }),
}
