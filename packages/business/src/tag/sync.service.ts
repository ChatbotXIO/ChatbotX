import type { ChannelType } from "@chatbotx.io/database/partials"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"

const SYNC_TAG_BULK_CHUNK_SIZE = 1000

class TagSyncService extends BaseService {
  /**
   * Enqueue outbound sync of a newly created tag — creates the label on every
   * channel integration in the workspace that has tag sync enabled.
   * Pure Redis enqueue. Caller must call AFTER the Tag row is committed.
   */
  async enqueueCreate(props: {
    workspaceId: string
    tagId: string
  }): Promise<void> {
    const { workspaceId, tagId } = props
    await defaultQueue.add(DefaultJobAction.syncTag, {
      type: DefaultJobAction.syncTag,
      data: { action: "create", workspaceId, tagId },
    })
  }

  /**
   * Enqueue outbound sync of a contact-tag attach.
   * Pure Redis enqueue — safe to call any time.
   * Caller must call AFTER inserting ContactToTag row (and AFTER tx commit if any).
   */
  async enqueueAttach(props: {
    workspaceId: string
    contactId: string
    tagId: string
  }): Promise<void> {
    const { workspaceId, contactId, tagId } = props
    await defaultQueue.add(DefaultJobAction.syncTag, {
      type: DefaultJobAction.syncTag,
      data: { action: "attach", workspaceId, contactId, tagId },
    })
  }

  /**
   * Batched variant for high-volume bulk tag operations. The queued job shape
   * stays one sync job per contact/tag pair, but Redis round-trips are grouped.
   */
  async enqueueAttachMany(
    pairs: {
      workspaceId: string
      contactId: string
      tagId: string
    }[],
  ): Promise<void> {
    for (let i = 0; i < pairs.length; i += SYNC_TAG_BULK_CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + SYNC_TAG_BULK_CHUNK_SIZE)
      await defaultQueue.addBulk(
        chunk.map((pair) => ({
          name: DefaultJobAction.syncTag,
          data: {
            type: DefaultJobAction.syncTag,
            data: {
              action: "attach",
              workspaceId: pair.workspaceId,
              contactId: pair.contactId,
              tagId: pair.tagId,
            },
          },
        })),
      )
    }
  }

  /**
   * Enqueue outbound detach (a tag removed from a contact). The worker handles
   * everything sync-related: unassigns the label on each sync-enabled channel
   * and deletes the matching ContactToTagChannel rows.
   * Pure Redis enqueue. Caller must call AFTER the local ContactToTag delete
   * commits (and outside any open transaction).
   */
  async enqueueDetach(props: {
    workspaceId: string
    contactId: string
    tagId: string
  }): Promise<void> {
    const { workspaceId, contactId, tagId } = props
    await defaultQueue.add(DefaultJobAction.syncTag, {
      type: DefaultJobAction.syncTag,
      data: { action: "detach", workspaceId, contactId, tagId },
    })
  }

  /**
   * Enqueue a tag delete.
   *
   * - Workspace delete (no channel scope): the worker removes the label on every
   *   sync-enabled channel and deletes the Tag row (cascading TagChannel /
   *   ContactToTagChannel / ContactToTag) — used by delete-tag-action.
   * - Channel-scoped delete (channelType + integrationId): the tag was deleted on
   *   one channel only (inbound webhook). The worker removes just that channel's
   *   mappings + the contacts tagged via it; the Tag row stays.
   *
   * Pure Redis enqueue.
   */
  async enqueueDelete(props: {
    workspaceId: string
    tagId: string
    channelType?: ChannelType
    integrationId?: string
  }): Promise<void> {
    const { workspaceId, tagId, channelType, integrationId } = props
    await defaultQueue.add(DefaultJobAction.syncTag, {
      type: DefaultJobAction.syncTag,
      data: {
        action: "delete",
        workspaceId,
        tagId,
        channelType,
        integrationId,
      },
    })
  }

  /**
   * Enqueue a full scan of an integration's existing channel labels into local
   * tags + mappings. Call after a channel is connected so labels already on the
   * channel are imported. Pure Redis enqueue — call AFTER the integration row
   * commits.
   */
  async enqueueChannelScan(props: {
    workspaceId: string
    channelType: ChannelType
    integrationId: string
  }): Promise<void> {
    const { workspaceId, channelType, integrationId } = props
    await defaultQueue.add(DefaultJobAction.syncChannelLabels, {
      type: DefaultJobAction.syncChannelLabels,
      data: { workspaceId, channelType, integrationId },
    })
  }
}

export const tagSyncService = new TagSyncService()
