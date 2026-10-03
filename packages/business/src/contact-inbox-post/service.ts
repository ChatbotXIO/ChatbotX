import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { contactInboxPostRepository } from "@chatbotx.io/database/repositories/contact-inbox-post"
import { workspaceDeletionStartedException } from "../errors"

export const CONTACT_INBOX_POST_DELETE_CHUNK_SIZE = 500
export const CONTACT_INBOX_POST_PURGE_BATCH_SIZE = 1000
export const CONTACT_INBOX_POST_PURGE_MAX_BATCHES = 100

class ContactInboxPostService {
  /**
   * Records that a contact inbox commented on a post. The repository insert
   * only succeeds when the post belongs to the contact inbox's own channel, so
   * a comment can never link a contact to another channel's post.
   */
  async recordComment(input: {
    commentedAt: Date
    contactInboxId: string
    inboxId: string
    postId: string
    workspaceId: string
  }): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const canWrite =
        await contactInboxPostRepository.lockWorkspaceForPostWrite(
          { workspaceId: input.workspaceId },
          tx,
        )
      if (!canWrite) {
        return false
      }

      return await contactInboxPostRepository.insertIfParentExists(
        {
          commentedAt: input.commentedAt,
          contactInboxId: input.contactInboxId,
          inboxId: input.inboxId,
          postId: input.postId,
          workspaceId: input.workspaceId,
        },
        tx,
      )
    })
  }

  async deleteForContacts(input: {
    contactIds: string[]
    tx: DatabaseClient
    workspaceId: string
  }): Promise<number> {
    const canDelete =
      await contactInboxPostRepository.lockWorkspaceForPostWrite(
        { workspaceId: input.workspaceId },
        input.tx,
      )
    if (!canDelete) {
      throw workspaceDeletionStartedException()
    }

    const lockedContactIds =
      await contactInboxPostRepository.lockContactsForDelete(
        { contactIds: input.contactIds, workspaceId: input.workspaceId },
        input.tx,
      )
    const contactInboxIds =
      await contactInboxPostRepository.lockContactInboxIdsByContactIds(
        { contactIds: lockedContactIds, workspaceId: input.workspaceId },
        input.tx,
      )

    let deleted = 0
    for (
      let index = 0;
      index < contactInboxIds.length;
      index += CONTACT_INBOX_POST_DELETE_CHUNK_SIZE
    ) {
      deleted += await contactInboxPostRepository.deleteByContactInboxIds(
        {
          contactInboxIds: contactInboxIds.slice(
            index,
            index + CONTACT_INBOX_POST_DELETE_CHUNK_SIZE,
          ),
          workspaceId: input.workspaceId,
        },
        input.tx,
      )
    }

    return deleted
  }

  async purgeWorkspace(input: {
    batchSize?: number
    maxBatches?: number
    workspaceId: string
  }): Promise<{ complete: boolean; deleted: number }> {
    const batchSize = input.batchSize ?? CONTACT_INBOX_POST_PURGE_BATCH_SIZE
    const maxBatches = input.maxBatches ?? CONTACT_INBOX_POST_PURGE_MAX_BATCHES
    let deleted = 0

    for (let batch = 0; batch < maxBatches; batch++) {
      const deletedBatch =
        await contactInboxPostRepository.deleteWorkspaceBatch({
          limit: batchSize,
          workspaceId: input.workspaceId,
        })
      deleted += deletedBatch
      if (deletedBatch < batchSize) {
        return { complete: true, deleted }
      }
    }

    return {
      complete: !(await contactInboxPostRepository.hasWorkspaceRows({
        workspaceId: input.workspaceId,
      })),
      deleted,
    }
  }
}

export const contactInboxPostService = new ContactInboxPostService()
