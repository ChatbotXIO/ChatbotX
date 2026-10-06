import {
  broadcastService,
  contactService,
  tagService,
} from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { sequenceService } from "@chatbotx.io/business/sequence"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { enqueueBulkTagStatsContacts } from "../../lib/enqueue-bulk-tag-stats"
import {
  bulkAddTagsPublicRequest,
  bulkContactIdsPublicRequest,
  bulkRemoveTagsPublicRequest,
  bulkResultPublicResponse,
  bulkSubscribeSequencesPublicRequest,
  bulkTagByStatsPublicRequest,
  bulkTagByStatsPublicResponse,
  bulkUnsubscribeSequencesPublicRequest,
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
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await tagService.attachByNamesToContacts({
          workspaceId: context.workspace.id,
          contactIds: input.contactIds,
          names: input.tags,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),

  bulkRemoveTags: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/tags/remove",
      summary: "Remove tags from multiple contacts by name",
      description:
        'Removes the given tags (by name) from every contact in `contactIds`, in chunks — safe to call with up to 1000 ids in one request. A contact that does not have a tag is left as is, and names that match no tag are ignored. Contact ids that don\'t resolve in this workspace are skipped and reported back in `skippedContactIds` rather than failing the whole request. Example: `{"contactIds":["1","2"],"tags":["VIP"]}`.',
      tags: ["Contacts"],
    })
    .input(bulkRemoveTagsPublicRequest)
    .output(bulkResultPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await tagService.detachByNamesFromContacts({
          workspaceId: context.workspace.id,
          contactIds: input.contactIds,
          names: input.tags,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),

  bulkTagByStats: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/tags/by-stats",
      summary: "Tag contacts by stats event",
      description:
        'Queues a background job that adds the given tags (by name) to every contact behind one stats event, so you do not have to page through the recipients and tag them in batches of 1000. Pick the `source`: `broadcast` (with `broadcastId` and an `eventType`), `sequenceStep` (`sequenceId`, `stepId`) or `commentAutomation` (`automationId`). Contacts in `excludedContactIds` are skipped. Returns 202 as soon as the job is queued; a broadcast or sequence that is not in this workspace returns 404. Example: `{"source":"broadcast","broadcastId":"1","eventType":"message:seen","tags":["Engaged"]}`.',
      successStatus: 202,
      tags: ["Contacts"],
    })
    .input(bulkTagByStatsPublicRequest)
    .output(bulkTagByStatsPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      if (input.source === "broadcast") {
        await broadcastService.findByIdOrName({
          workspaceId,
          idOrName: input.broadcastId,
        })
      } else if (input.source === "sequenceStep") {
        await sequenceService.assertOwned({
          workspaceId,
          sequenceId: input.sequenceId,
        })
      }
      return {
        queued: await enqueueBulkTagStatsContacts({
          workspaceId,
          // The token has no member: attribute the job to the workspace owner.
          requestedUserId: context.workspace.ownerId,
          request: input,
        }),
      }
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
    .errors(possibleErrorsOnCreatingResource)
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
      summary: "Subscribe multiple contacts to one or more sequences",
      description:
        "Subscribes every contact in `contactIds` that resolves in this workspace to every sequence in `sequenceIds`. Contact ids that don't resolve are skipped and reported back in `skippedContactIds` rather than failing the whole request.",
      tags: ["Contacts"],
    })
    .input(bulkSubscribeSequencesPublicRequest)
    .output(bulkResultPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await contactSequenceService.subscribeContacts({
          workspaceId: context.workspace.id,
          contactIds: input.contactIds,
          sequenceIds: input.sequenceIds,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),

  bulkUnsubscribeSequences: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/bulk/sequences/remove",
      summary: "Unsubscribe multiple contacts from one or more sequences",
      description:
        "Removes every contact in `contactIds` that resolves in this workspace from every sequence in `sequenceIds`, cancelling their pending sequence messages. A contact that is not in a sequence is left as is. Contact ids that don't resolve are skipped and reported back in `skippedContactIds` rather than failing the whole request. Returns 404 when a sequence id is not in this workspace.",
      tags: ["Contacts"],
    })
    .input(bulkUnsubscribeSequencesPublicRequest)
    .output(bulkResultPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { processedContactIds, skippedContactIds } =
        await contactSequenceService.unsubscribeContacts({
          workspaceId: context.workspace.id,
          contactIds: input.contactIds,
          sequenceIds: input.sequenceIds,
        })
      return { processed: processedContactIds.length, skippedContactIds }
    }),
}
