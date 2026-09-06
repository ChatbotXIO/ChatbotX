import { contactService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { z } from "zod"
import {
  contactSequenceIdsPublicRequest,
  listContactSequencesPublicResponse,
  setContactSequencesPublicRequest,
} from "@/features/contact-sequences/schema/public"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsSequencesPublicRouter = {
  listSequences: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "List sequences the contact is enrolled in",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(listContactSequencesPublicResponse)
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
      summary: "Enroll the contact in one or more sequences",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      contactSequenceIdsPublicRequest.and(
        z.object({ identifier: z.string().min(1) }),
      ),
    )
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await contactSequenceService.enrollContacts({
        workspaceId,
        contactIds: [contactId],
        sequenceIds: input.sequenceIds,
      })
    }),

  unsubscribeSequences: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "Remove the contact from one or more sequences",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      contactSequenceIdsPublicRequest.and(
        z.object({ identifier: z.string().min(1) }),
      ),
    )
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
        reason: "enrollment_removed",
      })
    }),

  setSequences: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "Replace all sequence enrollments for the contact",
      description:
        "Sets the contact's active sequence enrollments to exactly this list — sequences not in `sequenceIds` are unenrolled, missing ones are enrolled. Pass an empty array to unenroll from everything.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      setContactSequencesPublicRequest.and(
        z.object({ identifier: z.string().min(1) }),
      ),
    )
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
