import { contactService, tagService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  bulkAddTagsPublicRequest,
  bulkContactIdsPublicRequest,
  bulkSubscribeSequencesPublicRequest,
} from "../../schema/public/bulk"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsBulkPublicRouter = {
  bulkAddTags: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/tags",
      summary: "Add tags to multiple contacts by name",
      description:
        'Adds the given tags (by name) to every contact in `contactIds`, in chunks — safe to call with up to 1000 ids in one request. Existing tags whose name matches are reused; unmatched names are created. Example: `{"contactIds":["1","2"],"tags":["VIP"]}`.',
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(bulkAddTagsPublicRequest)
    .handler(async ({ context, input }) => {
      await tagService.attachByNamesToContacts({
        workspaceId: context.workspace.id,
        contactIds: input.contactIds,
        names: input.tags,
      })
    }),

  bulkDelete: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/delete",
      summary: "Delete multiple contacts",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(bulkContactIdsPublicRequest)
    .handler(async ({ context, input }) => {
      await contactService.deleteAndRecord({
        triggerSource: "api",
        workspaceId: context.workspace.id,
        ids: input.contactIds,
      })
    }),

  bulkSubscribeSequences: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/sequences",
      summary: "Enroll multiple contacts in one or more sequences",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(bulkSubscribeSequencesPublicRequest)
    .handler(async ({ context, input }) => {
      await contactSequenceService.enrollContacts({
        workspaceId: context.workspace.id,
        contactIds: input.contactIds,
        sequenceIds: input.sequenceIds,
      })
    }),
}
