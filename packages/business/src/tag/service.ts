import {
  type DatabaseClient,
  db,
  findOrFail,
} from "@chatbotx.io/database/client"
import {
  type ListTagsParams,
  tagRepository,
} from "@chatbotx.io/database/repositories"
import { contactModel } from "@chatbotx.io/database/schema"
import type { TagModel } from "@chatbotx.io/database/types"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { withCache } from "@chatbotx.io/redis"
import { adsConversionService } from "../ads-conversion/service"
import { BaseService } from "../base.service"
import { type ContactAccessScope, contactService } from "../contact"
import { ChatbotXException, notFoundException } from "../errors"
import { folderService } from "../folder"
import { logger } from "../logger"
import { tagSyncService } from "./sync.service"

const CONTACT_CHUNK_SIZE = 200
const TAG_DELETE_CHUNK_SIZE = 200

class TagService extends BaseService {
  protected readonly cachePrefix: string = "tags"

  async list(params: ListTagsParams) {
    return await tagRepository.list(params)
  }

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<TagModel[]> {
    const { tx = db, contactId } = props
    const key = `contacts:${contactId}:tags`

    return await withCache(
      key,
      async () => await tagRepository.findByContactId({ contactId }, tx),
      {
        tags: [`contacts:${contactId}`],
      },
    )
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    folderId?: string | null
    tx?: DatabaseClient
  }): Promise<TagModel | undefined> {
    const { workspaceId, key, folderId, tx = db } = props
    const folderCacheKey = folderId === undefined ? "any" : (folderId ?? "root")

    return await withCache(
      `tags:${workspaceId}:key:${key}:folder:${folderCacheKey}`,
      async () =>
        await tagRepository.findByKey({ workspaceId, key, folderId }, tx),
      {
        dynamicTags: (result) =>
          result
            ? [
                "tags",
                `tags:${workspaceId}`,
                `tags:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    folderId?: string | null
    tx?: DatabaseClient
  }): Promise<TagModel> {
    const tag = await this.findByKey(props)
    if (!tag) {
      throw notFoundException("Tag not found")
    }
    return tag
  }

  async create(props: {
    workspaceId: string
    data: { name: string; folderId?: string | null }
    tx?: DatabaseClient
  }): Promise<TagModel> {
    const { workspaceId, data, tx = db } = props

    const nameTaken = await tagRepository.existsByName(
      { workspaceId, name: data.name },
      tx,
    )
    if (nameTaken) {
      throw new ChatbotXException("Name is already taken.", "nameTaken", 400)
    }

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "tag",
        tx,
      })
    }

    const newTag = await tagRepository.create(
      { workspaceId, name: data.name, folderId: data.folderId ?? null },
      tx,
    )

    await tagSyncService.enqueueCreate({ workspaceId, tagId: newTag.id })

    return newTag
  }

  async update(props: {
    workspaceId: string
    id: string
    data: { name: string }
    tx?: DatabaseClient
  }): Promise<TagModel> {
    const { workspaceId, id, data, tx = db } = props

    const nameTaken = await tagRepository.existsByName(
      { workspaceId, name: data.name, excludeId: id },
      tx,
    )
    if (nameTaken) {
      throw new ChatbotXException("Name is already taken.", "nameTaken", 400)
    }

    const updated = await tagRepository.update(
      { id, workspaceId, name: data.name },
      tx,
    )
    if (!updated) {
      throw notFoundException("Tag not found")
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#tags`,
      `tags:${workspaceId}:${id}`,
    ])

    return updated
  }

  /**
   * Resolves/creates the requested tag names once, then attaches them to
   * every contact in `ids` (chunked). Emits `tagApplied` for every attempted
   * pair (existing callers depend on it) but only enqueues channel sync +
   * ads-conversion evaluation for pairs that were newly inserted, since
   * `ON CONFLICT DO NOTHING ... RETURNING` returns only new rows.
   */
  async addToContacts(props: {
    workspaceId: string
    ids: string[]
    tags: string[]
    accessScope?: ContactAccessScope
  }): Promise<void> {
    const { workspaceId, ids, tags, accessScope } = props
    if (ids.length === 0 || tags.length === 0) {
      return
    }

    const allTags = await this.upsertByNames({ workspaceId, names: tags })
    if (allTags.length === 0) {
      return
    }

    for (let i = 0; i < ids.length; i += CONTACT_CHUNK_SIZE) {
      const idChunk = ids.slice(i, i + CONTACT_CHUNK_SIZE)
      const contacts = await contactService.findManyByIds({
        workspaceId,
        ids: idChunk,
        accessScope,
      })
      if (contacts.length === 0) {
        continue
      }

      const links = contacts.flatMap((contact) =>
        allTags.map((selectedTag) => ({
          contactId: contact.id,
          tagId: selectedTag.id,
        })),
      )
      // RETURNING from ON CONFLICT DO NOTHING returns only newly-inserted rows.
      const newlyLinkedPairs = await tagRepository.linkContacts(links)

      // Emit tag applied for all attempted pairs (existing callers depend on it).
      for (const contact of contacts) {
        for (const tag of allTags) {
          try {
            await emitTagApplied(workspaceId, contact.id, tag.id)
          } catch (error) {
            logger.error({ err: error }, "Failed to emit tagApplied event:")
          }
        }
      }
      // Channel sync + ads conversion `tagApplied` trigger only for newly
      // attached pairs (not every attempted pair, unlike the emit loop above).
      for (const pair of newlyLinkedPairs) {
        await tagSyncService.enqueueAttach({
          workspaceId,
          contactId: pair.contactId,
          tagId: pair.tagId,
        })
      }
      // One batch resolve+enqueue call per chunk instead of one per pair.
      if (newlyLinkedPairs.length > 0) {
        await adsConversionService.enqueueTagAppliedEvaluationsBulk({
          workspaceId,
          pairs: newlyLinkedPairs.map((pair) => ({
            contactId: pair.contactId,
            tagId: pair.tagId,
          })),
        })
      }
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])
  }

  /**
   * Removes the requested tag names (by name — the dialog's TagsInputField +
   * useTagOptions emit names, not ids) from every contact in `ids` (chunked).
   */
  async removeFromContacts(props: {
    workspaceId: string
    ids: string[]
    tags: string[]
    accessScope?: ContactAccessScope
  }): Promise<void> {
    const { workspaceId, ids, tags, accessScope } = props
    if (ids.length === 0 || tags.length === 0) {
      return
    }

    const allTags = await tagRepository.findManyByNames({
      workspaceId,
      names: tags,
    })
    const allTagIds = allTags.map((tag) => tag.id)
    if (allTagIds.length === 0) {
      return
    }

    for (let i = 0; i < ids.length; i += CONTACT_CHUNK_SIZE) {
      const idChunk = ids.slice(i, i + CONTACT_CHUNK_SIZE)
      const contacts = await contactService.findManyByIds({
        workspaceId,
        ids: idChunk,
        accessScope,
      })
      if (contacts.length === 0) {
        continue
      }

      await tagRepository.unlinkContacts({
        contactIds: contacts.map((contact) => contact.id),
        tagIds: allTagIds,
      })

      // Channel cleanup (unassign + delete ContactToTagChannel) runs in the queue.
      for (const contact of contacts) {
        for (const tagId of allTagIds) {
          await tagSyncService.enqueueDetach({
            workspaceId,
            contactId: contact.id,
            tagId,
          })
        }
      }

      // Emit tag removed events per chunk.
      for (const contact of contacts) {
        for (const tag of allTags) {
          try {
            await emitTagRemoved(workspaceId, contact.id, tag.id)
          } catch (error) {
            logger.error({ err: error }, "Failed to emit tagRemoved event:")
          }
        }
      }
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])
  }

  /**
   * Diff-syncs one contact's tags to the requested name set: creates any
   * missing tags, links the resolved set, unlinks whatever fell out, and
   * reports which pairs actually changed so the caller can emit
   * events/enqueue sync exactly once per real change (not once per requested
   * name).
   */
  async syncContactTags(props: {
    workspaceId: string
    contactId: string
    tags: string[]
    accessScope?: ContactAccessScope
  }): Promise<TagModel[]> {
    const { workspaceId, contactId, tags, accessScope } = props

    const contact = await contactService.findByIdOrFail({
      workspaceId,
      id: contactId,
      accessScope,
    })

    const oldTagIds = new Set(
      await tagRepository.findLinkedTagIds({ contactId: contact.id }),
    )

    const { returnedTags, newlyAppliedTags, removedTagIds } =
      await db.transaction(async (tx) => {
        const resolvedTags = await tagRepository.ensureByNames(
          { workspaceId, names: tags },
          tx,
        )

        if (resolvedTags.length > 0) {
          await tagRepository.linkContacts(
            resolvedTags.map((selectedTag) => ({
              contactId: contact.id,
              tagId: selectedTag.id,
            })),
            tx,
          )
        }

        // Remove tags no longer selected (local ContactToTag only). Skip the
        // DELETE entirely when the snapshot diff shows nothing would change.
        const newTagIdSet = new Set(resolvedTags.map((t) => t.id))
        const hasRemovals = Array.from(oldTagIds).some(
          (id) => !newTagIdSet.has(id),
        )
        const removed = hasRemovals
          ? await tagRepository.unlinkContactExcept(
              {
                contactId: contact.id,
                keepTagIds: resolvedTags.map((t) => t.id),
              },
              tx,
            )
          : []

        return {
          returnedTags: resolvedTags,
          newlyAppliedTags: resolvedTags.filter(
            (tag) => !oldTagIds.has(tag.id),
          ),
          removedTagIds: removed.map((row) => row.tagId),
        }
      })

    // Emit tagApplied for newly added tags + enqueue sync
    for (const tag of newlyAppliedTags) {
      try {
        await emitTagApplied(workspaceId, contact.id, tag.id)
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagApplied event:")
      }

      await tagSyncService.enqueueAttach({
        workspaceId,
        contactId: contact.id,
        tagId: tag.id,
      })
    }
    // One batch resolve+enqueue call for every newly-applied tag on this
    // contact instead of one per tag.
    if (newlyAppliedTags.length > 0) {
      await adsConversionService.enqueueTagAppliedEvaluationsBulk({
        workspaceId,
        pairs: newlyAppliedTags.map((tag) => ({
          contactId: contact.id,
          tagId: tag.id,
        })),
      })
    }

    // Emit tagRemoved + enqueue channel cleanup for removed tags.
    for (const tagId of removedTagIds) {
      try {
        await emitTagRemoved(workspaceId, contact.id, tagId)
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagRemoved event:")
      }

      await tagSyncService.enqueueDetach({
        workspaceId,
        contactId: contact.id,
        tagId,
      })
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])

    return returnedTags
  }

  async deleteMany(props: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    const { workspaceId, ids } = props

    for (let i = 0; i < ids.length; i += TAG_DELETE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + TAG_DELETE_CHUNK_SIZE)
      const updated = await tagRepository.softDeleteMany({
        workspaceId,
        ids: chunk,
      })

      for (const row of updated) {
        await tagSyncService.enqueueDelete({ workspaceId, tagId: row.id })
      }
    }

    await this.invalidateCacheTags([`workspaces:${workspaceId}#tags`])
  }

  async upsertByNames(props: {
    workspaceId: string
    names: string[]
    tx?: DatabaseClient
  }): Promise<{ id: string; name: string }[]> {
    const { workspaceId, tx = db } = props
    const uniqueNames = [
      ...new Set(props.names.map((name) => name.trim())),
    ].filter((name) => name.length > 0)

    return await tagRepository.ensureByNames(
      { workspaceId, names: uniqueNames },
      tx,
    )
  }

  async attachToContact(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    /**
     * The `ContactInbox` this attach originated from, when the caller has one
     * in scope. Threaded to the `tagApplied` event so an ads/CAPI trigger
     * fired by this tag attributes to the originating integration's inbox
     * instead of the contact's most-recently-active inbox.
     */
    contactInboxId?: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, contactInboxId, tx = db } = props

    if (tagIds.length === 0) {
      return
    }

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    const tags = await tagRepository.findManyByIds(
      { workspaceId, ids: tagIds },
      tx,
    )

    if (tags.length === 0) {
      return
    }

    const newlyAttached = await tagRepository.linkContacts(
      tags.map((tag) => ({ contactId, tagId: tag.id })),
      tx,
    )

    for (const pair of newlyAttached) {
      emitTagApplied(workspaceId, contactId, pair.tagId, contactInboxId) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
    // One batch resolve+enqueue call for every newly-attached tag on this
    // contact instead of one per tag (HIGH-1).
    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId,
      pairs: newlyAttached.map((pair) => ({ contactId, tagId: pair.tagId })),
    })
  }

  /**
   * Attaches tags to many contacts with workspace/access-scope revalidation.
   *
   * Unlike the legacy manual bulk action, this emits `tagApplied` and queues
   * channel sync only for newly inserted contact/tag pairs. Bulk stat jobs can
   * be retried or re-run over already-tagged contacts without re-firing
   * automations or producing duplicate channel-sync storms.
   */
  async bulkAttachToContacts(props: {
    workspaceId: string
    contactIds: string[]
    tagIds: string[]
    accessScope?: ContactAccessScope
    recoverUnsyncedPairs?: boolean
  }): Promise<{ attachedPairCount: number }> {
    const { workspaceId, accessScope, recoverUnsyncedPairs = false } = props
    const uniqueContactIds = [...new Set(props.contactIds)]
    const uniqueTagIds = [...new Set(props.tagIds)]

    if (uniqueContactIds.length === 0 || uniqueTagIds.length === 0) {
      return { attachedPairCount: 0 }
    }

    const tags = await tagRepository.findManyByIds({
      workspaceId,
      ids: uniqueTagIds,
    })

    if (tags.length === 0) {
      return { attachedPairCount: 0 }
    }

    let attachedPairCount = 0
    for (let i = 0; i < uniqueContactIds.length; i += CONTACT_CHUNK_SIZE) {
      const idChunk = uniqueContactIds.slice(i, i + CONTACT_CHUNK_SIZE)
      const contacts = await contactService.findManyByIds({
        workspaceId,
        ids: idChunk,
        accessScope,
      })
      if (contacts.length === 0) {
        continue
      }

      const links = contacts.flatMap((contact) =>
        tags.map((tag) => ({
          contactId: contact.id,
          tagId: tag.id,
        })),
      )

      const newlyLinkedPairs = await tagRepository.linkContacts(links)

      attachedPairCount += newlyLinkedPairs.length

      const pairsToSync = recoverUnsyncedPairs
        ? await tagRepository.findUnsyncedPairs({
            contactIds: contacts.map((contact) => contact.id),
            tagIds: tags.map((tag) => tag.id),
          })
        : newlyLinkedPairs

      for (const pair of pairsToSync) {
        try {
          await emitTagApplied(workspaceId, pair.contactId, pair.tagId)
        } catch (error) {
          logger.error({ err: error }, "Failed to emit tagApplied event")
        }
      }
      // One batch resolve+enqueue call per chunk instead of one per pair
      // (HIGH-1) — bulkAttachToContacts already chunks contacts at 200.
      await adsConversionService.enqueueTagAppliedEvaluationsBulk({
        workspaceId,
        pairs: pairsToSync.map((pair) => ({
          contactId: pair.contactId,
          tagId: pair.tagId,
        })),
      })

      await tagSyncService.enqueueAttachMany(
        pairsToSync.map((pair) => ({
          workspaceId,
          contactId: pair.contactId,
          tagId: pair.tagId,
        })),
      )
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])

    return { attachedPairCount }
  }

  async detachFromContact(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    const removed = await tagRepository.unlinkContacts(
      { contactIds: [contactId], tagIds },
      tx,
    )

    for (const pair of removed) {
      emitTagRemoved(workspaceId, contactId, pair.tagId) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }

  async detachAllFromContact(props: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    const tags = await this.listByContactId({ contactId, tx })
    if (tags.length === 0) {
      return
    }

    await tagRepository.unlinkAllFromContact({ contactId }, tx)

    for (const tag of tags) {
      emitTagRemoved(workspaceId, contactId, tag.id) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }
}

export const tagService = new TagService()
