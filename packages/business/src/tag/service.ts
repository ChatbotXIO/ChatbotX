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
  tagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import type { TagChannelModel, TagModel } from "@chatbotx.io/database/types"
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

  /**
   * Upsert tags by name + link to one contact, capturing only newly-inserted
   * pairs — moved VERBATIM from the worker's `attachTagsByNames` transaction
   * body. Returns just the newly-linked tag ids; the worker handler keeps its
   * own `tagSyncService.enqueueAttach` loop, `emitTagApplied` fan-out, and
   * `adsConversionService.enqueueTagAppliedEvaluationsForInbox` call.
   *
   * Do NOT confuse this with `attachByNamesToContacts` (plural) — that method
   * emits `tagApplied` for every ATTEMPTED pair (not just new ones), uses
   * `enqueueTagAppliedEvaluationsBulk`, and invalidates 3 workspace cache
   * tags. This one intentionally has none of that; the worker owns those
   * side effects itself.
   */
  async attachByNamesToContact(props: {
    workspaceId: string
    contactId: string
    names: string[]
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { workspaceId, contactId, names: tagNames } = props
    if (tagNames.length === 0) {
      return []
    }

    const newlyLinkedTagIds: string[] = []
    const run = async (tx: DatabaseClient) => {
      await tx
        .insert(tagModel)
        .values(
          tagNames.map((t) => ({
            name: t,
            workspaceId,
            id: createId(),
          })),
        )
        .onConflictDoNothing()
        .returning()

      const existingTags = await tx
        .select()
        .from(tagModel)
        .where(
          and(
            eq(tagModel.workspaceId, workspaceId),
            inArray(tagModel.name, tagNames),
          ),
        )

      if (existingTags.length > 0) {
        // Capture only the pairs that were actually inserted so we mirror /
        // emit exactly once per newly-applied tag (not for pre-existing links).
        const linked = await tx
          .insert(contactsToTagsModel)
          .values(
            existingTags.map((t) => ({
              contactId,
              tagId: t.id,
            })),
          )
          .onConflictDoNothing()
          .returning({ tagId: contactsToTagsModel.tagId })

        newlyLinkedTagIds.push(...linked.map((l) => l.tagId))
      }
    }

    if (props.tx) {
      await run(props.tx)
    } else {
      await db.transaction(run)
    }

    return newlyLinkedTagIds
  }

  /**
   * Resolve tag ids by name — NO `deletedAt IS NULL` filter (matches the
   * worker's `detachTagsByNames` exact filter set; do not add one).
   */
  async listIdsByNames(props: {
    workspaceId: string
    names: string[]
    tx?: DatabaseClient
  }): Promise<{ id: string }[]> {
    const { workspaceId, names, tx = db } = props
    if (names.length === 0) {
      return []
    }
    return await tx.query.tagModel.findMany({
      where: { workspaceId, name: { in: names } },
      columns: { id: true },
    })
  }

  /** Unlink tags from one contact by tag id. Handler keeps its own emit/enqueue fan-out. */
  async detachTagIdsFromContact(props: {
    contactId: string
    tagIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { contactId, tagIds, tx = db } = props
    if (tagIds.length === 0) {
      return
    }
    await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.contactId, contactId),
          inArray(contactsToTagsModel.tagId, tagIds),
        ),
      )
  }

  /** Unlink one workspace tag from many contacts (inbox-label unassign). */
  async detachTagFromContacts(props: {
    tagId: string
    contactIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tagId, contactIds, tx = db } = props
    if (contactIds.length === 0) {
      return
    }
    await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.tagId, tagId),
          inArray(contactsToTagsModel.contactId, contactIds),
        ),
      )
  }

  /**
   * Link a workspace tag to many contacts, returning the NEWLY-linked
   * contact ids (untargeted `onConflictDoNothing()` — verbatim from
   * `inbox_labels/sync.ts` `assignLabel`).
   */
  async linkTagToContactsReturningNew(props: {
    tagId: string
    contactIds: string[]
    tx?: DatabaseClient
  }): Promise<{ contactId: string }[]> {
    const { tagId, contactIds, tx = db } = props
    if (contactIds.length === 0) {
      return []
    }
    return await tx
      .insert(contactsToTagsModel)
      .values(contactIds.map((contactId) => ({ contactId, tagId })))
      .onConflictDoNothing()
      .returning({ contactId: contactsToTagsModel.contactId })
  }

  /** Record per-channel tag assignments (used for reconciliation / detach). */
  async recordTagChannelAssignments(props: {
    tagId: string
    tagChannelId: string
    contactInboxIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tagId, tagChannelId, contactInboxIds, tx = db } = props
    if (contactInboxIds.length === 0) {
      return
    }
    await tx
      .insert(contactToTagChannelModel)
      .values(
        contactInboxIds.map((contactInboxId) => ({
          tagId,
          tagChannelId,
          contactInboxId,
        })),
      )
      .onConflictDoNothing()
  }

  /** Remove per-channel tag assignments (inbox-label unassign). */
  async deleteTagChannelAssignments(props: {
    tagChannelId: string
    contactInboxIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tagChannelId, contactInboxIds, tx = db } = props
    if (contactInboxIds.length === 0) {
      return
    }
    await tx
      .delete(contactToTagChannelModel)
      .where(
        and(
          eq(contactToTagChannelModel.tagChannelId, tagChannelId),
          inArray(contactToTagChannelModel.contactInboxId, contactInboxIds),
        ),
      )
  }

  /** Find the channel mapping for an external label id. */
  async findTagChannel(props: {
    workspaceId: string
    channelType: TagChannelModel["channelType"]
    integrationId: string
    externalLabelId: string
    tx?: DatabaseClient
  }): Promise<Pick<TagChannelModel, "id" | "tagId"> | undefined> {
    const {
      workspaceId,
      channelType,
      integrationId,
      externalLabelId,
      tx = db,
    } = props
    return await tx.query.tagChannelModel.findFirst({
      where: { workspaceId, channelType, integrationId, externalLabelId },
      columns: { id: true, tagId: true },
    })
  }

  /**
   * Get-or-create a tag by name — moved VERBATIM from `inbox_labels/sync.ts`
   * `ensureTag`, including the three-step race handling (find → insert with
   * the partial-unique `onConflictDoNothing` → read-back retry on a lost
   * race). Do not simplify.
   */
  async ensureTagByName(props: {
    workspaceId: string
    name: string
    tx?: DatabaseClient
  }): Promise<string | undefined> {
    const { workspaceId, name, tx = db } = props
    const where = { workspaceId, name, deletedAt: { isNull: true as const } }

    const found = await tx.query.tagModel.findFirst({
      where,
      columns: { id: true },
    })
    if (found) {
      return found.id
    }

    const [created] = await tx
      .insert(tagModel)
      .values({ id: createId(), workspaceId, name })
      .onConflictDoNothing({
        // Tag_workspaceId_name_key is a partial unique index (deletedAt IS NULL).
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })
      .returning({ id: tagModel.id })
    if (created) {
      return created.id
    }

    // Lost a race against a concurrent insert — read the winner back.
    const retry = await tx.query.tagModel.findFirst({
      where,
      columns: { id: true },
    })
    return retry?.id
  }

  /**
   * Get-or-create a tag's channel mapping — moved VERBATIM from
   * `inbox_labels/sync.ts` `ensureChannel`, including the read-back retry.
   */
  async ensureTagChannel(props: {
    workspaceId: string
    tagId: string
    channelType: TagChannelModel["channelType"]
    integrationId: string
    externalLabelId: string
    tx?: DatabaseClient
  }): Promise<string | undefined> {
    const {
      workspaceId,
      tagId,
      channelType,
      integrationId,
      externalLabelId,
      tx = db,
    } = props
    const [created] = await tx
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId,
        tagId,
        channelType,
        integrationId,
        externalLabelId,
      })
      .onConflictDoNothing({
        target: [
          tagChannelModel.tagId,
          tagChannelModel.channelType,
          tagChannelModel.integrationId,
        ],
      })
      .returning({ id: tagChannelModel.id })
    if (created) {
      return created.id
    }

    const retry = await tx.query.tagChannelModel.findFirst({
      where: { tagId, workspaceId, channelType, integrationId },
      columns: { id: true },
    })
    return retry?.id
  }
}

export const tagService = new TagService()
