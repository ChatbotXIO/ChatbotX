import { contactService, tagService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  bulkAddTagsPublicRequest,
  bulkContactIdsPublicRequest,
  bulkResultPublicResponse,
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
        'Adds the given tags (by name) to every contact in `contactIds`, in chunks — safe to call with up to 1000 ids in one request. Existing tags whose name matches are reused; unmatched names are created. Contact ids that don\'t resolve in this workspace are skipped and reported back in `skippedContactIds` rather than failing the whole request. Example: `{"contactIds":["1","2"],"tags":["VIP"]}`.',
      tags: ["Contacts"],
    })
    .input(bulkAddTagsPublicRequest)
    .output(bulkResultPublicResponse)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await tagService.attachByNamesToContacts({
          workspaceId: context.workspace.id,
          contactIds: input.contactIds,
          names: input.tags,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),

  bulkDelete: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/delete",
      summary: "Delete multiple contacts",
      description:
        "Deletes every contact in `contactIds` that resolves in this workspace. Ids that don't resolve are skipped and reported back in `skippedContactIds` rather than failing the whole request.",
      tags: ["Contacts"],
    })
    .input(bulkContactIdsPublicRequest)
    .output(bulkResultPublicResponse)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await contactService.deleteAndRecord({
          triggerSource: "api",
          workspaceId: context.workspace.id,
          ids: input.contactIds,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),

  bulkSubscribeSequences: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/sequences",
      summary: "Enroll multiple contacts in one or more sequences",
      description:
        "Enrolls every contact in `contactIds` that resolves in this workspace into every sequence in `sequenceIds`. Contact ids that don't resolve are skipped and reported back in `skippedContactIds` rather than failing the whole request.",
      tags: ["Contacts"],
    })
    .input(bulkSubscribeSequencesPublicRequest)
    .output(bulkResultPublicResponse)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await contactSequenceService.enrollContacts({
          workspaceId: context.workspace.id,
          contactIds: input.contactIds,
          sequenceIds: input.sequenceIds,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),
}
