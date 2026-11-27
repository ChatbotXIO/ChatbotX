import {
  adsConversionService,
  tagService,
  tagSyncService,
} from "@chatbotx.io/business"
import { succeeded, type TriggerActionHandler } from "./types"

export const addTag: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const tagIds = context.action.tagIds as string[]
  const { workspaceId } = context
  const newlyLinked = await tagService.attachExistingToContactForTrigger({
    workspaceId,
    contactId: conversation.contactId,
    tagIds,
  })

  for (const link of newlyLinked) {
    await tagSyncService.enqueueAttach({
      workspaceId,
      contactId: conversation.contactId,
      tagId: link.tagId,
    })
    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId,
      contactId: conversation.contactId,
      tagId: link.tagId,
    })
  }
  return succeeded
}

export const removeTag: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const tagIds = context.action.tagIds as string[]
  const { workspaceId } = context
  if (tagIds.length > 0) {
    await tagService.detachFromContactForTrigger({
      workspaceId,
      contactId: conversation.contactId,
      tagIds,
    })
    // Channel cleanup (unassign + delete ContactToTagChannel) runs in the queue.
    for (const tagId of tagIds) {
      await tagSyncService.enqueueDetach({
        workspaceId,
        contactId: conversation.contactId,
        tagId,
      })
    }
  }
  return succeeded
}
