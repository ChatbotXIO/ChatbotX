import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  isNull,
  notExists,
  sql,
} from "@chatbotx.io/database/client"
import {
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  contactToTagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import type { TagModel } from "@chatbotx.io/database/types"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { withCache } from "@chatbotx.io/redis"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { adsConversionService } from "../ads-conversion/service"
import { BaseService } from "../base.service"
import { type ContactAccessScope, contactService } from "../contact"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { tagSyncService } from "./sync.service"

const CONTACT_CHUNK_SIZE = 200

class TagService extends BaseService {
  protected readonly cachePrefix: string = "tags"

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<TagModel[]> {
    const { tx = db, contactId } = props
    const key = `contacts:${contactId}:tags`

    return await withCache(
      key,
      async () =>
        await tx.query.tagModel.findMany({
          where: {
            deletedAt: { isNull: true as const },
            contactsToTags: { contactId },
          },
          orderBy: { name: "asc" },
        }),
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
    return await withCache(
      `tags:${workspaceId}:key:${key}`,
      async () => {
        const folderWhere =
          folderId === null ? { isNull: true as const } : folderId

        if (isNumericId(key)) {
          const byId = await tx.query.tagModel.findFirst({
            where: {
              id: key,
              workspaceId,
              deletedAt: { isNull: true as const },
              folderId: folderWhere,
            },
          })
          if (byId) {
            return byId
          }
        }

        return await tx.query.tagModel.findFirst({
          where: {
            name: key,
            workspaceId,
            deletedAt: { isNull: true as const },
            folderId: folderWhere,
          },
        })
      },
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

  async upsertByNames(props: {
    workspaceId: string
    names: string[]
    tx?: DatabaseClient
  }): Promise<{ id: string; name: string }[]> {
    const { workspaceId, tx = db } = props
    const uniqueNames = [
      ...new Set(props.names.map((name) => name.trim())),
    ].filter((name) => name.length > 0)

    if (uniqueNames.length === 0) {
      return []
    }

    await tx
      .insert(tagModel)
      .values(
        uniqueNames.map((name) => ({
          id: createId(),
          name,
          workspaceId,
        })),
      )
      .onConflictDoNothing({
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })

    return await tx.query.tagModel.findMany({
      where: {
        workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: uniqueNames },
      },
      columns: {
        id: true,
        name: true,
      },
    })
  }

  async attachToContact(props: {
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

    const tags = await tx.query.tagModel.findMany({
      where: {
        workspaceId,
        id: { in: tagIds },
        deletedAt: { isNull: true as const },
      },
      columns: { id: true },
    })

    if (tags.length === 0) {
      return
    }

    const newlyAttached = await tx
      .insert(contactsToTagsModel)
      .values(tags.map((tag) => ({ contactId, tagId: tag.id })))
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })
      .returning({ tagId: contactsToTagsModel.tagId })

    for (const pair of newlyAttached) {
      emitTagApplied(workspaceId, contactId, pair.tagId) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
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

    const tags = await db.query.tagModel.findMany({
      where: {
        workspaceId,
        id: { in: uniqueTagIds },
        deletedAt: { isNull: true as const },
      },
      columns: { id: true },
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

      const newlyLinkedPairs = await db
        .insert(contactsToTagsModel)
        .values(links)
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })
        .returning({
          contactId: contactsToTagsModel.contactId,
          tagId: contactsToTagsModel.tagId,
        })

      attachedPairCount += newlyLinkedPairs.length

      const pairsToSync = recoverUnsyncedPairs
        ? await this.findUnsyncedContactTagPairs({
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

  private async findUnsyncedContactTagPairs(props: {
    contactIds: string[]
    tagIds: string[]
  }): Promise<{ contactId: string; tagId: string }[]> {
    if (props.contactIds.length === 0 || props.tagIds.length === 0) {
      return []
    }

    return await db
      .select({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })
      .from(contactsToTagsModel)
      .where(
        and(
          inArray(contactsToTagsModel.contactId, props.contactIds),
          inArray(contactsToTagsModel.tagId, props.tagIds),
          notExists(
            db
              .select({ value: sql`1` })
              .from(contactToTagChannelModel)
              .innerJoin(
                contactInboxModel,
                eq(
                  contactToTagChannelModel.contactInboxId,
                  contactInboxModel.id,
                ),
              )
              .where(
                and(
                  eq(
                    contactInboxModel.contactId,
                    contactsToTagsModel.contactId,
                  ),
                  eq(contactToTagChannelModel.tagId, contactsToTagsModel.tagId),
                ),
              ),
          ),
        ),
      )
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

    const removed = await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.contactId, contactId),
          inArray(contactsToTagsModel.tagId, tagIds),
        ),
      )
      .returning({ tagId: contactsToTagsModel.tagId })

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

    await tx
      .delete(contactsToTagsModel)
      .where(eq(contactsToTagsModel.contactId, contactId))

    for (const tag of tags) {
      emitTagRemoved(workspaceId, contactId, tag.id) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }
}

export const tagService = new TagService()
