import {
  pipelineActivityRepository,
  pipelineItemContentRepository,
  pipelineItemRepository,
} from "@chatbotx.io/database/repositories"
import type { PipelineItemCommentModel } from "@chatbotx.io/database/types"
import { notFoundException } from "../errors"
import type { PipelineAccessScope } from "./access"
import { PipelineItemBaseService } from "./item-base.service"
import { activityRowFor, realtimeEffect } from "./mutation-engine"
import type { PipelineActor } from "./types"

type ItemInput = {
  workspaceId: string
  pipelineId: string
  itemId: string
  scope: PipelineAccessScope
  actor: PipelineActor
}

/** Comments and attachments of an item; each write serialises on the item row. */
export class PipelineItemContentService extends PipelineItemBaseService {
  async addComment(
    input: ItemInput & { text: string; idempotencyKey?: string },
  ): Promise<PipelineItemCommentModel> {
    const { workspaceId, itemId, actor } = input
    return await this.withLockedItem(
      input,
      "edit",
      async ({ tx, effects, item }) => {
        const { row, inserted } =
          await pipelineItemContentRepository.insertCommentIdempotent(
            {
              workspaceId,
              itemId,
              text: input.text,
              createdById: actor.userId,
              idempotencyKey: input.idempotencyKey ?? null,
            },
            tx,
          )
        if (!inserted) {
          return row
        }
        // `createdAt` is the transaction's start time, which can predate a
        // comment committed while this one waited on the item lock; recompute
        // under the lock so the timestamp never moves backwards.
        const latest = await pipelineItemContentRepository.latestCommentAt(
          { workspaceId, itemId },
          tx,
        )
        await pipelineItemRepository.update(
          {
            workspaceId,
            id: itemId,
            values: { lastCommentAt: latest ?? row.createdAt },
          },
          tx,
        )
        await pipelineActivityRepository.insertMany(
          [activityRowFor("commentAdded", { item, actor, now: row.createdAt })],
          tx,
        )
        effects.push(realtimeEffect(item, "updated"))
        return row
      },
    )
  }

  async deleteComment(input: ItemInput & { commentId: string }): Promise<void> {
    const { workspaceId, itemId, actor } = input
    await this.withLockedItem(input, "edit", async ({ tx, effects, item }) => {
      const deleted = await pipelineItemContentRepository.deleteComment(
        { workspaceId, itemId, id: input.commentId },
        tx,
      )
      if (!deleted) {
        throw notFoundException("Comment not found")
      }
      const latest = await pipelineItemContentRepository.latestCommentAt(
        { workspaceId, itemId },
        tx,
      )
      await pipelineItemRepository.update(
        { workspaceId, id: itemId, values: { lastCommentAt: latest } },
        tx,
      )
      await pipelineActivityRepository.insertMany(
        [activityRowFor("commentDeleted", { item, actor, now: new Date() })],
        tx,
      )
      effects.push(realtimeEffect(item, "updated"))
    })
  }

  async addAttachments(
    input: ItemInput & { mediaLibraryFileIds: string[] },
  ): Promise<void> {
    const { workspaceId, itemId, actor } = input
    await this.withLockedItem(input, "edit", async ({ tx, effects, item }) => {
      await this.assertMediaFiles(workspaceId, input.mediaLibraryFileIds, tx)
      const inserted = await pipelineItemContentRepository.insertAttachments(
        { workspaceId, itemId, mediaLibraryFileIds: input.mediaLibraryFileIds },
        tx,
      )
      // Re-adding files the item already has changes nothing.
      if (inserted === 0) {
        return
      }
      await pipelineItemRepository.touch({ workspaceId, id: itemId }, tx)
      await pipelineActivityRepository.insertMany(
        [activityRowFor("attachmentAdded", { item, actor, now: new Date() })],
        tx,
      )
      effects.push(realtimeEffect(item, "updated"))
    })
  }

  async removeAttachment(
    input: ItemInput & { mediaLibraryFileId: string },
  ): Promise<void> {
    const { workspaceId, itemId, actor } = input
    await this.withLockedItem(input, "edit", async ({ tx, effects, item }) => {
      const removed = await pipelineItemContentRepository.deleteAttachment(
        { workspaceId, itemId, mediaLibraryFileId: input.mediaLibraryFileId },
        tx,
      )
      if (!removed) {
        throw notFoundException("Attachment not found")
      }
      await pipelineItemRepository.touch({ workspaceId, id: itemId }, tx)
      await pipelineActivityRepository.insertMany(
        [activityRowFor("attachmentRemoved", { item, actor, now: new Date() })],
        tx,
      )
      effects.push(realtimeEffect(item, "updated"))
    })
  }
}

export const pipelineItemContentService = new PipelineItemContentService()
